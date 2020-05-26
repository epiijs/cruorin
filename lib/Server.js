const http = require('http');
const crypto = require('crypto');
const LRUCache = require('lru-cache');
const Bridge = require('./Bridge.js');
const Flight = require('./Flight.js');
const Memory = require('./Memory.js');
const promise = require('./kernel/promise.js');
const { IncomingMessage, OutgoingMessage, buildOutgoing } = require('./kernel/Message.js');

const PRIVATE_METHODS = [
  'checkMethod', 'handleRequest', 'getRequestDigest', 'willApplyCache', 'useCachePolicy'
];
const PROTECT_METHODS = ['listen'];
const VIRTUAL_METHODS = [
  'reviseRequest', 'mustSkipCache', 'mustWaitAgent', 'canCacheError', 'getCachePolicy'
];

const PRIVATE = {};
PRIVATE_METHODS.forEach((key) => {
  PRIVATE[key] = Symbol(key);
});

/**
 * respond with message
 *
 * @param {http.ServerResponse} response
 * @param {OutgoingMessage} message
 */
function respondWith(response, message) {
  if (message instanceof OutgoingMessage) {
    response.writeHead(message.status, message.headers);
    response.write(message.buffer);
    response.end();
  }
}

class Server {
  /**
   * constructor
   * @memberof Server
   */
  constructor(options = {}) {
    this.server = http.createServer(this[PRIVATE.handleRequest].bind(this));
    this.caches = {
      digest: new LRUCache({ max: 1000, maxAge: 1e3 * 3600 * 24 })
    };
    this.memory = new Memory(options);
    this.runway = new Map();
    this.bridge = new Bridge({
      'purge-cache': (payload) => this.memory.purgeItem(payload.digest)
    });
    this[PRIVATE.checkMethod]();
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
    if (!errorMethod) return;
    throw new Error(`[Server::${errorMethod}] can NOT be overrided`);
  }

  /**
   * handle server request
   *
   * @param {http.IncomingMessage} request
   * @param {http.ServerResponse} response
   * @memberof Server
   */
  async [PRIVATE.handleRequest](request, response) {
    const incoming = this.reviseRequest(new IncomingMessage(request));
    const digest = this[PRIVATE.getRequestDigest](incoming);

    // purge cache
    if (incoming.method === 'DELETE') {
      await promise.autoCatch(this.memory.purgeItem(digest));
      this.bridge.sendMessage('purge-cache', { digest });
      respondWith(response, buildOutgoing(200, `${incoming.uniqueId} purged`));
      return;
    }

    // skip non GET requests
    if (incoming.method !== 'GET') {
      respondWith(response, buildOutgoing(405));
      return;
    }

    // todo - support HEAD
    // todo - defend flood

    if (!this.mustSkipCache(incoming)) {
      const outgoing = await promise.autoCatch(this.memory.fetchItem(digest));
      if (outgoing) {
        if (!outgoing.expired) {
          respondWith(response, outgoing);
          return;
        }
        await promise.autoCatch(this.memory.purgeItem(digest));
      }
    }

    let flight = this.runway.get(digest);
    if (!flight) {
      flight = new Flight(incoming);
      this.runway.set(digest, flight);
    }
    if (this.mustWaitAgent(incoming)) {
      flight.carry((outgoing) => {
        if (this[PRIVATE.willApplyCache](incoming, outgoing)) {
          this[PRIVATE.useCachePolicy](incoming, outgoing);
        }
        respondWith(response, outgoing);
      });
    } else {
      respondWith(response, buildOutgoing(404));
    }
    flight.start(10 * 1000, (outgoing) => {
      this.runway.delete(digest);
      // write cache memory
      if (this[PRIVATE.willApplyCache](incoming, outgoing)) {
        this[PRIVATE.useCachePolicy](incoming, outgoing);
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
      outgoing.setCacheHeaders(cachePolicy.maxage, cachePolicy.pragma);
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
    const key = incoming.uniqueId;
    const cache = this.caches.digest;
    if (!cache.has(key)) {
      // cache this slow operation
      const hasher = crypto.createHash('md5');
      hasher.update(key);
      cache.set(key, hasher.digest('hex'));
    }
    return cache.get(key);
  }

  /**
   * indicate if outgoing message can be cache
   *
   * @param {IncomingMessage} incoming
   * @param {OutgoingMessage} outgoing
   * @memberof Server
   */
  [PRIVATE.willApplyCache](incoming, outgoing) {
    return !this.canCacheError(incoming, outgoing)
      && outgoing.status > 199 && outgoing.status < 400;
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

  /* eslint-disable-next-line class-methods-use-this */
  reviseRequest(message) {
    return message;
  }

  /* eslint-disable-next-line class-methods-use-this, no-unused-vars */
  canCacheError(message) {
    return false;
  }

  /* eslint-disable-next-line class-methods-use-this, no-unused-vars */
  getCachePolicy(message) {
    return {
      maxage: 60 * 60,
      pragma: 'public'
    };
  }

  /* eslint-disable-next-line class-methods-use-this, no-unused-vars */
  mustSkipCache(message) {
    return false;
  }

  /* eslint-disable-next-line class-methods-use-this, no-unused-vars */
  mustWaitAgent(message) {
    return true;
  }
}

module.exports = Server;
