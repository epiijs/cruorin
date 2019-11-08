/* eslint global-require: 0 */
/* eslint import/no-extraneous-dependencies: 0 */

const http = require('http');
const crypto = require('crypto');
const LRUCache = require('lru-cache');
const Memory = require('./Memory.js');
const Worker = require('./Worker.js');
const Logger = require('./Logger.js');
const Handler = require('./kernel/Handler.js');
const promise = require('./kernel/promise.js');
const { IncomingMessage } = require('./kernel/Message.js');

let pm2 = null;
try {
  pm2 = require('pm2');
} catch (err) {
  console.err(err);
  pm2 = null;
}

const PRIVATE_METHODS = [
  'checkMethod', 'handleRequest', 'useCachePolicy',
  'getRequestDigest', 'verifyResponse', 'willPurgeCache'
];
const PROTECT_METHODS = ['listen'];
const VIRTUAL_METHODS = [
  'reviseRequest', 'getCachePolicy',
  'mustSkipCache', 'mustWaitAgent', 'willEmitError',
  'inferUpstream'
];

const PRIVATE = {};
PRIVATE_METHODS.forEach((key) => {
  PRIVATE[key] = Symbol(key);
});

class Server {
  /**
   * constructor
   * @memberof Server
   */
  constructor(options) {
    this.server = http.createServer(this[PRIVATE.handleRequest].bind(this));
    this.caches = {
      digest: new LRUCache({ max: 1000, maxAge: 1e3 * 3600 * 24 })
    };
    this.memory = new Memory(options);
    this.worker = new Worker();
    this.pm2_ids = new Set();
    this.logger = Logger.getInstance();
    this[PRIVATE.checkMethod]();

    // 若当前使用 pm2 环境，则增加监听器，保存 pm2 id 集合
    if (pm2) {
      pm2.list((error, list) => {
        if (error) {
          return console.error(error);
        }
        if (list.length) {
          list.forEach(item => this.pm2_ids.add(item.pm2_env.pm_id));
          process.on('message', ({ data = {} }) => {
            const { action, url } = data;
            if (!action) {
              return null;
            }
            // type=purge-cache 则干掉当前进程缓存
            if (action === 'purge-cache') {
              this.purgeCache(url);
            }
          });
        }
      });
    }
  }

  /**
   * check public method
   *
   * @memberof Server
   */
  [PRIVATE.checkMethod]() {
    const proto = Server.prototype;
    VIRTUAL_METHODS.forEach((key) => {
      Object.defineProperty(
        proto, key, { configurable: false, writable: false }
      );
    });
    const errorMethod = PROTECT_METHODS.find(key => this[key] !== proto[key]);
    if (! errorMethod) return;
    throw new Error(`[Server::${errorMethod}] can NOT be overrided`);
  }

  /**
   * purge cache
   *
   * @param {String} url
   * @CacheKeys cacheKeys
   */
  async purgeCache(url) {
    const cacheKeys = this.caches.digest
      .keys()
      .filter(key => url === key.substr(key.indexOf('/')));
    await Promise.all(
      cacheKeys.map(
        key => promise.autoCatch(this.memory.purgeItem(this.caches.digest.get(key)))
      )
    );
    return cacheKeys;
  }

  /**
   * handle server request
   *
   * @param {http.IncomingMessage} request
   * @param {http.ServerResponse} response
   * @memberof Server
   */
  async [PRIVATE.handleRequest](request, response) {
    const handler = new Handler(response);
    const incoming = new IncomingMessage(request);

    // todo - support POST admin command
    // if (incoming.method === 'POST' && incoming.url === '/report') {
    //   return handler.respond(200, this.report.debugFrame())
    // }

    const digest = this[PRIVATE.getRequestDigest](incoming);

    // purge cache
    if (incoming.method === 'DELETE') {
      const cacheKeys = await this.purgeCache(incoming.url);
      // 在 pm2 环境下给其他进程发送清理缓存消息
      if (pm2) {
        const ids = Array.from(this.pm2_ids);
        for (let i = 0; i < ids.length; i += 1) {
          pm2.sendDataToProcessId(ids[i], {
            data: {
              action: 'purge-cache',
              url: incoming.url,
            },
            topic: 'message'
          });
        }
      }
      return handler.respond(200, `${cacheKeys.join(',')} purged`);
    }

    // skip non GET requests
    if (incoming.method !== 'GET') {
      return handler.respond(403, 'not implemented');
    }

    // todo - support HEAD
    // todo - defend DoS according to report

    // this.report.recordAction(Report.ACTION.TOTAL)
    if (! this.mustSkipCache(incoming)) {
      const outgoing = await promise.autoCatch(this.memory.fetchItem(digest));
      if (outgoing) {
        this[PRIVATE.useCachePolicy](incoming, outgoing);
        if (! this[PRIVATE.willPurgeCache](outgoing)) {
          return handler.respondRaw(outgoing);
        }
        await promise.autoCatch(this.memory.purgeItem(digest));
      }
    }

    // todo - use getOptions
    let thread = this.worker.getThread(digest);
    if (! thread) {
      const upstream = this.inferUpstream(incoming);
      if (! upstream) {
        return handler.respond(500, 'upstream not provided');
      }
      thread = this.worker.createThread(digest, upstream);
    }
    if (this.mustWaitAgent(incoming)) {
      thread.enqueue((outgoing) => {
        if (this[PRIVATE.verifyResponse](incoming, outgoing)) {
          this[PRIVATE.useCachePolicy](incoming, outgoing);
        }
        handler.respondRaw(outgoing);
      });
    } else {
      handler.respond(404);
    }
    thread.execute(10 * 1000, (outgoing) => {
      this.worker.removeThread(digest);
      // write cache memory
      if (this[PRIVATE.verifyResponse](incoming, outgoing)) {
        promise.autoCatch(this.memory.writeItem(digest, outgoing));
      }
    });
  }

  /**
   * use cache policy
   *
   * @param {IncomingMessage} incoming
   * @param {OutgoingMessage} outgoing
   * @memberof Server
   */
  [PRIVATE.useCachePolicy](incoming, outgoing) {
    const cachePolicy = this.getCachePolicy(incoming, outgoing);
    if (cachePolicy) {
      outgoing.setCacheHeaders(cachePolicy.time, cachePolicy.pragma);
    }
  }

  /**
   * get incoming message digest
   * only consider URL
   *
   * @param {IncomingMessage} incoming message
   * @returns {String} digest
   * @memberof Server
   */
  [PRIVATE.getRequestDigest](incoming) {
    this.reviseRequest(incoming);
    const source = incoming.headers.host + incoming.url;
    const cache = this.caches.digest;
    if (! cache.has(source)) {
      // cache this slow operation
      const hasher = crypto.createHash('md5');
      hasher.update(source);
      cache.set(source, hasher.digest('hex'));
    }
    return cache.get(source);
  }

  /**
   * verify response status
   *
   * @param {IncomingMessage} incoming
   * @param {OutgoingMessage} outgoing
   * @memberof Server
   */
  [PRIVATE.verifyResponse](incoming, outgoing) {
    return ! this.willEmitError(incoming, outgoing)
      && outgoing.status > 199 && outgoing.status < 400;
  }

  /**
   * indicate if cache will be purged
   *
   * @param {OutgoingMessage} outgoing
   * @returns {Boolean}
   * @memberof Server
   */
  [PRIVATE.willPurgeCache](outgoing) {
    const { expires } = outgoing.headers;
    const now = new Date();
    if (expires) {
      return now - new Date(expires) > 0;
    }
    return false;
  }

  /* protect methods */

  /**
   * start server and listen
   *
   * @param {any} port
   * @param {any} callback
   * @memberof Server
   */
  listen(port, callback) {
    this.server.listen(port, callback);
  }

  /* virtual methods */

  reviseRequest(message) {
    return message;
  }

  getCachePolicy(message) {
    return {
      time: 60 * 60,
      pragma: 'public'
    };
  }

  /**
   * get incoming message for upstream
   *
   * @param {IncomingMessage} message
   * @returns {IncomingMessage} upstream
   * @memberof Server
   */
  inferUpstream(message) {
    return message;
  }

  mustSkipCache(message) {
    return false;
  }

  mustWaitAgent(message) {
    return true;
  }

  willEmitError(message) {
    return false;
  }
}

module.exports = Server;
