const uuidv4 = require('uuid/v4')
const { OutgoingMessage } = require('./Message.js')

class Handler {
  /**
   * constructor
   * @param {http.ServerResponse} response 
   * @memberof Handler
   */
  constructor(response) {
    this.response = response
    this.start = new Date()
    this.token = uuidv4()
  }

  /**
   * respond raw message
   * 
   * @param {OutgoingMessage} message 
   * @memberof Handler
   */
  respondRaw(message) {
    if (message instanceof OutgoingMessage) {
      this.response.writeHead(message.status, message.headers)
      this.response.write(message.buffer)
      this.response.end()
    }
  }

  /**
   * respond short message
   * support useful status codes
   *
   * @see {@link https://www.w3.org/Protocols/rfc2616/rfc2616-sec10.html}
   *
   * @param {Number=} code - status code, default 200
   * @param {String=} text - response body, default nothing
   * @param {String=} mime - response MIME, default text/plain
   * @param {String=} encoding - response encoding, default utf-8
   * @memberof Handler
   */
  respond(code, text, mime, encoding) {
    var message = new OutgoingMessage()
    message.status = code || 200
    message.headers['Content-Type'] = mime || 'text/plain'
    if (! text) text = ''
    text = typeof text === 'string' ? text : JSON.stringify(text)
    if (! text.endsWith('\r\n')) text += '\r\n'
    message.buffer = Buffer.from(text, encoding)
    this.respondRaw(message)
  }
}

module.exports = Handler
