const http = require('http')
const crypto = require('crypto')
const LRUCache = require('lru-cache')
const Memory = require('./Memory.js')
const Worker = require('./Worker.js')
const Logger = require('./Logger.js')
const Report = require('./Report.js')
const Handler = require('./kernel/Handler.js')
const promise = require('./kernel/promise.js')
const { IncomingMessage, OutgoingMessage } = require('./kernel/Message.js')

const PRIVATE_METHODS = [
  'checkMethod', 'handleRequest', 'useCachePolicy',
  'getRequestDigest', 'verifyResponse'
]
const PROTECT_METHODS = ['listen']
const VIRTUAL_METHODS = [
  'reviseRequest', 'getCachePolicy',
  'mustSkipCache', 'mustWaitAgent', 'willEmitError',
  'inferUpstream'
]

const PRIVATE = {}
PRIVATE_METHODS.forEach(key => PRIVATE[key] = Symbol())

class Server {
  /**
   * constructor
   * @memberof Server
   */
  constructor(options) {
    this.server = http.createServer(this[PRIVATE.handleRequest].bind(this))
    this.caches = {
      digest: new LRUCache({ max: 1000, maxAge: 1e3 * 3600 * 24 })
    }
    this.memory = new Memory(options)
    this.worker = new Worker()
    this.report = Report.getInstance()
    this[PRIVATE.checkMethod]()
  }

  /**
   * check public method
   * 
   * @memberof Server
   */
  [PRIVATE.checkMethod]() {
    var proto = Server.prototype
    VIRTUAL_METHODS.forEach((key) => Object.defineProperty(
      proto, key, { configurable: false, writable: false }
    ))
    var errorMethod = PROTECT_METHODS.find((key) => this[key] !== proto[key])
    if (! errorMethod) return
    throw new Error(`[Server::${errorMethod}] can NOT be overrided`)
  }

  /**
   * handle server request
   * 
   * @param {http.IncomingMessage} request 
   * @param {http.ServerResponse} response 
   * @returns 
   * @memberof Server
   */
  async [PRIVATE.handleRequest](request, response) {
    var handler = new Handler(response)
    var incoming = new IncomingMessage(request)

    // todo - support POST admin command
    // if (incoming.method === 'POST' && incoming.url === '/report') {
    //   return handler.respond(200, this.report.debugFrame())
    // }

    // skip non GET requests
    if (incoming.method !== 'GET') {
      return handler.respond(403, 'not implemented')
    }

    // todo - auto purge by cache policy
    // todo - support DELETE purge cache
    // todo - support HEAD
    // todo - defend DoS according to report

    // this.report.recordAction(Report.ACTION.TOTAL)
    var digest = this[PRIVATE.getRequestDigest](incoming)
    if (! this.mustSkipCache(incoming)) {
      let outgoing = await promise.autoCatch(this.memory.fetchItem(digest))
      if (outgoing) {
        this[PRIVATE.useCachePolicy](incoming, outgoing)
        return handler.respondRaw(outgoing)
      }
    }

    // todo - use getOptions
    var thread = this.worker.getThread(digest)
    if (! thread) {
      let upstream = this.inferUpstream(incoming)
      if (! upstream) {
        return handler.respond(500, 'upstream not provided')
      }
      thread = this.worker.createThread(digest, upstream)
    }
    if (this.mustWaitAgent(incoming)) {
      thread.enqueue((outgoing) => {
        if (this[PRIVATE.verifyResponse](incoming, outgoing)) {
          this[PRIVATE.useCachePolicy](incoming, outgoing)
        }
        handler.respondRaw(outgoing)
      })
    } else {
      handler.respond(404)
    }
    thread.execute(10 * 1000, (outgoing) => {
      // write cache memory
      if (this[PRIVATE.verifyResponse](incoming, outgoing)) {
        promise.autoCatch(this.memory.writeItem(digest, outgoing))
      }
    })
  }

  /**
   * use cache policy
   * 
   * @param {IncomingMessage} incoming 
   * @param {OutgoingMessage} outgoing 
   * @memberof Server
   */
  [PRIVATE.useCachePolicy](incoming, outgoing) {
    var cachePolicy = this.getCachePolicy(incoming, outgoing)
    if (cachePolicy) {
      outgoing.setCacheHeaders(cachePolicy.time, cachePolicy.pragma)
    }
  }

  /**
   * get incoming message digest
   * 
   * @param {IncomingMessage} incoming message
   * @returns {String} digest
   * @memberof Server
   */
  [PRIVATE.getRequestDigest](incoming) {
    var cache = this.caches.digest
    incoming = this.reviseRequest(incoming)
    var source = incoming.url
    if (! cache.has(source)) {
      // cache this slow operation
      var hasher = crypto.createHash('md5')
      hasher.update(source)
      cache.set(source, hasher.digest('hex'))
    }
    return cache.get(source)
  }

  /**
   * verify response status
   * 
   * @param {IncomingMessage} incoming 
   * @param {OutgoingMessage} outgoing 
   * @memberof Server
   */
  [PRIVATE.verifyResponse](incoming, outgoing) {
    return ! this.willEmitError(incoming, outgoing) &&
      outgoing.status > 199 && outgoing.status < 400
  }

  /* protect methods */

  /**
   * 
   * 
   * @param {any} port 
   * @param {any} callback 
   * @memberof Server
   */
  listen(port, callback) {
    this.server.listen(port, callback)
  }

  /* virtual methods */

  reviseRequest(message) {
    return message
  }

  getCachePolicy(message) {
    return {
      time: 10 * 60 * 60,
      pragma: 'public'
    }
  }

  /**
   * get incoming message for upstream
   * 
   * @param {IncomingMessage} message
   * @returns {IncomingMessage} upstream
   * @memberof Server
   */
  inferUpstream(message) {
    return message
  }

  mustSkipCache(message) {
    return false
  }

  mustWaitAgent(message) {
    return true
  }

  willEmitError(message) {
    return true
  }
}

module.exports = Server