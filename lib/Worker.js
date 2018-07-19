const fetch = require('node-fetch');
const { OutgoingMessage } = require('./kernel/Message.js');
const Logger = require('./Logger.js');
const promise = require('./kernel/promise.js');

class Thread {
  constructor(message) {
    this.message = message;
    this.request = null;
    this.actions = [];
    this.working = false;
  }

  enqueue(action) {
    this.actions.push(action);
    // var report = Report.getInstance()
    // report.recordAction(Report.ACTION.PROXY_INSERT_ACTION)
  }

  dequeue() {
    return this.actions.shift();
  }

  async execute(timeout, callback) {
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

class Worker {
  constructor() {
    this.threads = new Map();
    // this.report = Report.getInstance()
  }

  /**
   * get thread by digest
   *
   * @param {String} digest
   * @returns {Thread} thread
   * @memberof Worker
   */
  getThread(digest) {
    return this.threads.get(digest);
  }

  /**
   * remove thread by digest
   *
   * @param {String} digest
   * @memberof Worker
   */
  removeThread(digest) {
    this.threads.delete(digest);
  }

  /**
   * create and manage thread
   *
   * @param {String} digest
   * @param {IncomingMessage} message
   * @returns {Thread} thread
   * @memberof Worker
   */
  createThread(digest, message) {
    const thread = new Thread(message);
    this.threads.set(digest, thread);
    // this.report.recordAction(Report.ACTION.PROXY_CREATE_THREAD)
    return thread;
  }
}

module.exports = Worker;
