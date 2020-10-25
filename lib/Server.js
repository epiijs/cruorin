const http = require('http');
const crypto = require('crypto');
const LRUCache = require('lru-cache');
const TypeFo = require('typefo');
const Bridge = require('./Bridge.js');
const Flight = require('./Flight.js');
const Memory = require('./Memory.js');
const promise = require('./promise.js');
const { IncomingMessage, OutgoingMessage } = require('httply');

const typefo = new TypeFo([
  // protected
  'handleRequest', 'getRequestDigest', 'willApplyCache',
  // public
  ['listen', true],
  // public virtual
  'reviseRequest', 'willApplyCache', 'willAwaitReply'
]);
const SYMBOLs = typefo.symbols;

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
    this.server = http.createServer(this[SYMBOLs.handleRequest].bind(this));
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
  async [SYMBOLs.handleRequest](request, response) {
    const incoming = this.reviseRequest(new IncomingMessage(request));
    const digest = this[SYMBOLs.getRequestDigest](incoming);

    // purge cache
    if (incoming.method === 'DELETE') {
      await promise.autoCatch(this.memory.purgeItem(digest));
      this.bridge.sendMessage('purge-cache', { digest });
      new OutgoingMessage({ status: 200, content: `${digest} purged` }).sendBy(response);
      return;
    }

    // skip non GET requests
    if (incoming.method !== 'GET') {
      new OutgoingMessage({ status: 405 }).sendBy(response);
      return;
    }

    // todo - support HEAD
    // todo - defend flood

    if (this.willApplyCache(incoming)) {
      const outgoing = await promise.autoCatch(this.memory.fetchItem(digest));
      if (outgoing) {
        outgoing.sendBy(response);
        return;
      }
    }

    let flight = this.flights.get(digest);
    if (!flight) {
      flight = new Flight(incoming);
      this.flights.set(digest, flight);
    }
    if (this.willAwaitReply(incoming)) {
      flight.board((outgoing) => {
        outgoing.sendBy(response);
      });
    } else {
      new OutgoingMessage({ status: 404 }).sendBy(response);
    }
    flight.start(this.options.timeout, (outgoing) => {
      this.flights.delete(digest);
      // write cache memory
      if (this[SYMBOLs.willApplyCache](incoming, outgoing)) {
        promise.autoCatch(this.memory.writeItem(digest, outgoing));
      }
    });
  }

  /**
   * get incoming message digest
   * only consider URL
   *
   * @param {IncomingMessage} incoming message
   * @returns {String} digest
   * @memberof Server
   */
  [SYMBOLs.getRequestDigest](incoming) {
    const key = incoming.headers.host + incoming.url;
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
  [SYMBOLs.willApplyCache](incoming, outgoing) {
    const judge = this.willApplyCache(incoming, outgoing);
    if (typeof judge === 'boolean') return judge;
    return outgoing.status > 199 && outgoing.status < 400;
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
  willApplyCache(incoming, outgoing) {
    return true;
  }

  /* eslint-disable-next-line class-methods-use-this, no-unused-vars */
  willAwaitReply(message) {
    return true;
  }
}

module.exports = Server;
