/* eslint-disable dot-notation */

const fetch = require('node-fetch');
const { OutgoingMessage } = require('httply');
const promise = require('./promise.js');

class Flight {
  constructor(message) {
    this.message = message;
    this.request = null;
    this.actions = [];
    this.working = false;
  }

  board(action) {
    this.actions.push(action);
  }

  async start(timeout, callback) {
    if (this.working) return;
    this.working = true;
    const url = this.message.protocol + '://' + this.message.headers.host + this.message.url;
    // TODO - auto forward
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
      // agent-to-cruorin should be keep-alive
      headers['connection'] = 'keep-alive';
      // node-fetch will decode automatically
      // cruorin should not tell agents encoding
      delete headers['content-encoding'];
      result = new OutgoingMessage({
        status: response.status,
        content: await response.buffer(),
        headers
      });
    } catch (error) {
      result = new OutgoingMessage({ status: 504 });
    }
    this.actions.forEach(action => action(result));
    if (callback) callback(result);
    this.working = false;
    this.actions = [];
  }
}

module.exports = Flight;
