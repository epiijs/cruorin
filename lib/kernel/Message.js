const MAX_BUFFER_LENGTH = 1024 * 1024 * 64

const EMPTY_BUFFER = Buffer.from([])

class IncomingMessage {
  constructor(message) {
    if (! message) {
      message = { url: '/', method: 'GET', headers: {} }
    }
    this.url = message.url
    this.method = message.method
    this.headers = Object.assign({}, message.headers)
  }
}

class OutgoingMessage {
  constructor(message) {
    if (! message) {
      message = { status: 200, buffer: EMPTY_BUFFER, headers: {} }
    }
    if (typeof message.status !== 'number' && message.status < 0) {
      throw new Error('illegal status')
    }
    if (
      ! Buffer.isBuffer(message.buffer) || 
      message.buffer.length > MAX_BUFFER_LENGTH
    ) {
      throw new Error('illegal buffer')
    }
    this.status = message.status
    this.buffer = message.buffer
    this.headers = Object.assign({}, message.headers)
  }

  /**
   * set header field
   *
   * @param {String} key - field key
   * @param {String=} value - field value
   * @memberof Context
   */
  header(key, value) {
    if (! key || typeof key !== 'string') return
    // header will discard key when null value
    this.headers[key] = value == null ? undefined : value
  }

  /**
   * set cache headers
   *
   * @see {@link https://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html}
   *
   * @param {Number} time - cached time (s)
   * @param {String=} pragma
   * @memberof Context
   */
  setCacheHeaders(time, pragma) {
    if (time <= 0) return
    var now = new Date()
    this.header('Cache-Control', 'public, max-age=' + time)
    this.header('Last-Modified', now.toUTCString())
    this.header('Expires', new Date(now.getTime() + time * 1000).toUTCString())
    this.header('Pragma', pragma || 'public')
  }
}

module.exports = {
  IncomingMessage, OutgoingMessage
}