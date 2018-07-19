const fs = require('fs');
const os = require('os');
const path = require('path');
const util = require('util');
const crc = require('crc');
const LRUCache = require('lru-cache');
const { OutgoingMessage } = require('./kernel/Message.js');

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const killFile = util.promisify(fs.unlink);
function safeMkdir(dir) {
  return new Promise((resolve, reject) => {
    fs.access(dir, (error1) => {
      if (! error1) return resolve();
      fs.mkdir(dir, error2 => (error2 ? reject(error2) : resolve()));
    });
  });
}

/**
 * make directory recursively
 *
 * @param {String} dir
 */
async function makeDeepDir(dir) {
  const parts = dir.split('/').filter(Boolean);
  let cursor = '/';
  for (let i = 0; i < parts.length; i += 1) {
    cursor = path.join(cursor, parts[i]);
    await safeMkdir(cursor);
  }
}

class Memory {
  constructor(options) {
    this.options = this.lintOptions(options);
    this.cache = new LRUCache({ max: 1000, maxAge: 1000 * 60 });
  }

  /**
   * check and fix options
   *
   * @param {Object} options
   * @returns {Object} fixed options
   * @memberof Memory
   */
  lintOptions(options) {
    if (! options.rootDir) {
      console.log('use default memory root dir');
      options.rootDir = path.join(os.homedir(), '.cruorin');
    }
    return options;
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
   * get CRC32(buffer)
   *
   * @param {Buffer} buffer
   * @returns {String} CRC32(buffer)
   * @memberof Memory
   */
  getDataChecksum(buffer) {
    return crc.crc32(buffer).toString(16);
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
      .catch(() => {
        throw new Error(`file error <- ${digest}`);
      });
    const [meta, body] = content;
    if (meta.hash !== this.getDataChecksum(body)) {
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
    await makeDeepDir(pathmap.root);
    const meta = {
      hash: this.getDataChecksum(message.buffer),
      more: { status: message.status, headers: message.headers }
    };
    await Promise.all([
      writeFile(pathmap.meta, JSON.stringify(meta)),
      writeFile(pathmap.body, message.buffer)
    ])
      .catch(() => {
        throw new Error(`file error -> ${digest}`);
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
      .catch(() => {
        throw new Error(`file error -> ${digest}`);
      });
  }
}

module.exports = Memory;
