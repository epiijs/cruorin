const http = require('http');
const crypto = require('crypto');
const LRUCache = require('lru-cache');
const TypeFo = require('typefo');
const Bridge = require('./Bridge.js');
const Flight = require('./Flight.js');
const Memory = require('./Memory.js');
const promise = require('./kernel/promise.js');
const { IncomingMessage, OutgoingMessage, buildOutgoing } = require('./kernel/Message.js');

const typefo = new TypeFo([
  // protected
  'handleRequest', 'getRequestDigest', 'willApplyCache', 'useCachePolicy',
  // public
  ['listen', true],
  // public virtual
  'reviseRequest', 'mustSkipCache', 'mustWaitAgent', 'canCacheError', 'policyOfCache'
]);
const SYMBOL = typefo.symbols;

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

/**
 * check and fix options
 *
 * @param {Object} options
 * @returns {Object} fixed options
 */
function lintOptions(options) {
  const newOptions = options;
  if (!options.timeout) {
    console.log('use default server timeout');
    newOptions.timeout = 10 * 1000;
  }
  return newOptions;
}

class Server {
  /**
   * constructor
   * @memberof Server
   */
  constructor(options = {}) {
    this.options = lintOptions(options);
    this.server = http.createServer(this[SYMBOL.handleRequest].bind(this));
    this.bridge = new Bridge({
      'purge-cache': (payload) => this.memory.purgeItem(payload.digest)
    });
    this.memory = new Memory(options);
    this.digests = new LRUCache({ max: 1000, maxAge: 1e3 * 3600 * 24 });
    this.flights = new Map();
    typefo.protect.call(this, Server);
  }

  /**
   * handle server request
   *
   * @param {http.IncomingMessage} request
   * @param {http.ServerResponse} response
   * @memberof Server
   */
  async [SYMBOL.handleRequest](request, response) {
    const incoming = this.reviseRequest(new IncomingMessage(request));
    const digest = this[SYMBOL.getRequestDigest](incoming);

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

    let flight = this.flights.get(digest);
    if (!flight) {
      flight = new Flight(incoming);
      this.flights.set(digest, flight);
    }
    if (this.mustWaitAgent(incoming)) {
      flight.board((outgoing) => {
        if (this[SYMBOL.willApplyCache](incoming, outgoing)) {
          this[SYMBOL.useCachePolicy](incoming, outgoing);
        }
        respondWith(response, outgoing);
      });
    } else {
      respondWith(response, buildOutgoing(404));
    }
    flight.start(this.options.timeout, (outgoing) => {
      this.flights.delete(digest);
      // write cache memory
      if (this[SYMBOL.willApplyCache](incoming, outgoing)) {
        this[SYMBOL.useCachePolicy](incoming, outgoing);
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
  [SYMBOL.useCachePolicy](incoming, outgoing) {
    const policy = this.policyOfCache(incoming, outgoing);
    if (policy) {
      outgoing.setCacheHeaders(policy.maxage, policy.action);
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
  [SYMBOL.getRequestDigest](incoming) {
    const key = incoming.uniqueId;
    const cache = this.digests;
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
  [SYMBOL.willApplyCache](incoming, outgoing) {
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
  policyOfCache(message) {
    return {
      maxage: 60 * 60,
      // todo - more
      action: 'public'
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
