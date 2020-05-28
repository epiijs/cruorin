/* eslint-disable max-classes-per-file */

const MAX_BUFFER_LENGTH = 1024 * 1024 * 64;
const EMPTY_BUFFER = Buffer.from([]);

class IncomingMessage {
  constructor(message = { url: '/', method: 'GET', headers: {} }) {
    this.url = message.url;
    this.method = message.method;
    this.headers = { ...message.headers };
  }

  get uniqueId() {
    return this.headers.host + this.url;
  }
}

class OutgoingMessage {
  constructor(message = { status: 200, buffer: EMPTY_BUFFER, headers: {} }) {
    if (typeof message.status !== 'number' || message.status < 0) {
      throw new Error('illegal status');
    }
    if (
      !Buffer.isBuffer(message.buffer)
      || message.buffer.length > MAX_BUFFER_LENGTH
    ) {
      throw new Error('illegal buffer');
    }
    this.status = message.status;
    this.buffer = message.buffer;
    this.headers = {};
    Object.keys(message.headers).forEach((key) => {
      this.headers[key.toLowerCase()] = message.headers[key];
    });
    this.headers.connection = 'keep-alive';
  }

  get expired() {
    const { expires } = this.headers;
    const now = new Date();
    if (expires) {
      return now - new Date(expires) > 0;
    }
    return false;
  }

  /**
   * set header field
   *
   * @param {String} key - field key
   * @param {String=} value - field value
   * @memberof Context
   */
  setHeader(key, value) {
    if (!key || typeof key !== 'string') return;
    // header will discard key when null value
    this.headers[key] = value == null ? undefined : value;
  }

  /**
   * set cache headers
   *
   * @see {@link https://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html}
   *
   * @param {Number} maxage
   * @param {String=} action
   * @memberof Context
   */
  setCacheHeaders(maxage, action) {
    if (maxage <= 0) return;
    const now = new Date();
    this.setHeader('cache-control', `${action}, max-age=${maxage}`);
    this.setHeader('expires', new Date(now.getTime() + maxage * 1000).toUTCString());
  }
}

/**
 * build basic outgoing message
 * support useful status codes
 *
 * @see {@link https://www.w3.org/Protocols/rfc2616/rfc2616-sec10.html}
 *
 * @param {Number=} code - status code, default 200
 * @param {String=} text - response body, default nothing
 * @param {String=} mime - response MIME, default text/plain
 * @param {String=} encoding - response encoding, default utf-8
 */
function buildOutgoing(code, text = '', mime, encoding) {
  const message = new OutgoingMessage();
  message.status = code || 200;
  message.headers['Content-Type'] = mime || 'text/plain';
  let output = typeof text === 'string' ? text : JSON.stringify(text);
  if (!output.endsWith('\r\n')) output += '\r\n';
  message.buffer = Buffer.from(output, encoding);
  return message;
}

module.exports = {
  IncomingMessage, OutgoingMessage, buildOutgoing
};
