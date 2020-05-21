const Thread = require('./Thread.js');

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
