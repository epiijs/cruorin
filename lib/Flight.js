const fetch = require('node-fetch');
const { OutgoingMessage } = require('./kernel/Message.js');
const promise = require('./kernel/promise.js');

class Flight {
  constructor(message) {
    this.message = message;
    this.request = null;
    this.actions = [];
    this.working = false;
  }

  carry(action) {
    this.actions.push(action);
  }

  async start(timeout, callback) {
    if (this.working) return;
    this.working = true;
    const url = 'http://' + this.message.headers.host + this.message.url;
    // todo - auto forward
    this.request = promise.bindTimeout(
      fetch(url, { method: 'GET', headers: this.message.headers }), timeout
    );
    let result = null;
    try {
      const response = await this.request;
      const headers = {};
      Object.keys(response.headers.raw()).forEach((key) => {
        headers[key] = response.headers.get(key);
      });
      result = new OutgoingMessage({
        status: response.status,
        buffer: await response.buffer(),
        headers
      });
    } catch (error) {
      result = new OutgoingMessage({
        status: 504,
        buffer: Buffer.from('upstream timeout\r\n'),
        headers: {}
      });
    }
    this.actions.forEach(action => action(result));
    if (callback) callback(result);
    this.working = false;
    this.actions = [];
  }
}

module.exports = Flight;
