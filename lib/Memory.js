const fs = require('fs');
const os = require('os');
const path = require('path');
const util = require('util');
const crc = require('crc');
const LRUCache = require('lru-cache');
const { OutgoingMessage } = require('./kernel/Message.js');

const existFile = (p) => new Promise((resolve) => {
  fs.access(p, error => resolve(!error));
});
const makeDir = util.promisify(fs.mkdir);
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const killFile = util.promisify(fs.unlink);

/**
 * check and fix options
 *
 * @param {Object} options
 * @returns {Object} fixed options
 */
function lintOptions(options) {
  const newOptions = options;
  if (!options.rootDir) {
    console.log('use default memory root dir');
    newOptions.rootDir = path.join(os.homedir(), '.cruorin');
  }
  return newOptions;
}

/**
 * get buffer crc32
 *
 * @param {Buffer} buffer
 * @returns {String} buffer crc32
 */
function getChecksum(buffer) {
  return crc.crc32(buffer).toString(16);
}

class Memory {
  constructor(options) {
    this.options = lintOptions(options);
    this.cache = new LRUCache({ max: 1000, maxAge: 1000 * 60 });
  }

  /**
   * get full path by digest
   *
   * @param {String} digest
   * @returns {Object} full body path + full meta path
   * @memberof Memory
   */
  getFullPath(digest) {
    if (typeof digest !== 'string' || digest.length < 32) {
      throw new Error('illegal digest');
    }
    const dataDir = path.join(
      this.options.rootDir,
      digest.slice(0, 2), digest.slice(2, 4)
    );
    const bodyPath = path.join(dataDir, digest);
    const metaPath = bodyPath + '.meta';
    return { root: dataDir, body: bodyPath, meta: metaPath };
  }

  /**
   * fetch cache item
   *
   * @param {String} digest
   * @returns {Promise<Buffer>}
   * @memberof Memory
   */
  async fetchItem(digest) {
    if (this.cache.has(digest)) {
      return this.cache.get(digest);
    }
    const pathmap = this.getFullPath(digest);
    const content = await Promise.all([
      readFile(pathmap.meta, 'utf8').then(body => JSON.parse(body)),
      readFile(pathmap.body)
    ])
      .catch((error) => {
        if (!error.code) console.error(error);
        throw new Error(`file error <- ${digest} ${error.code || ''}`);
      });
    const [meta, body] = content;
    if (meta.hash !== getChecksum(body)) {
      throw new Error(`file error <> ${digest}`);
    }
    const result = new OutgoingMessage({
      status: meta.more.status || 200,
      buffer: body,
      headers: meta.more.headers || {}
    });
    this.cache.set(digest, result);
    return result;
  }

  /**
   * promise to write data into cache
   *
   * @param {String} digest
   * @param {OutgoingMessage} message
   * @returns {Promise}
   * @memberof Memory
   */
  async writeItem(digest, message) {
    const pathmap = this.getFullPath(digest);
    if (!(await existFile(pathmap.root))) {
      await makeDir(pathmap.root, { recursive: true });
    }
    const meta = {
      hash: getChecksum(message.buffer),
      more: { status: message.status, headers: message.headers }
    };
    await Promise.all([
      writeFile(pathmap.meta, JSON.stringify(meta)),
      writeFile(pathmap.body, message.buffer)
    ])
      .catch((error) => {
        throw new Error(`file error -> ${digest} ${error.code}`);
      });
  }

  /**
   * promise to purge cache data
   *
   * @param {String} digest
   * @memberof Memory
   */
  async purgeItem(digest) {
    this.cache.del(digest);
    const pathmap = this.getFullPath(digest);
    await Promise.all([
      killFile(pathmap.meta),
      killFile(pathmap.body)
    ])
      .catch((error) => {
        throw new Error(`file error -> ${digest} ${error.code}`);
      });
  }
}

module.exports = Memory;
