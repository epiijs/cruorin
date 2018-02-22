const fs = require('fs')
const os = require('os')
const path = require('path')
const util = require('util')
const crc = require('crc')
const LRUCache = require('lru-cache')
const { OutgoingMessage } = require('./kernel/Message.js')

const readFile = util.promisify(fs.readFile)
const writeFile = util.promisify(fs.writeFile)
const safeMkdir = function (dir) {
  return new Promise((resolve, reject) => {
    fs.access(dir, (error1) => {
      if (! error1) return resolve()
      fs.mkdir(dir, (error2) => error2 ? reject(error2) : resolve())
    })
  })
}

/**
 * make directory recursively
 * 
 * @param {String} dir 
 * @returns 
 */
async function makeDeepDir(dir) {
  var parts = dir.split('/').filter(Boolean)
  var cursor = '/'
  for (var i = 0; i < parts.length; i ++) {
    cursor = path.join(cursor, parts[i])
    await safeMkdir(cursor)
  }
}

class Memory {
  constructor(options) {
    this.options = this.lintOptions(options)
    this.cache = new LRUCache({ max: 1000, maxAge: 1000 * 60 })
  }

  /**
   * check and fix options
   * 
   * @param {Object} options 
   * @returns {Object} fixed options
   * @memberof Memory
   */
  lintOptions(options) {
    var opts = {}
    if (options && typeof options === 'object') {
      opts = Object.assign(opts, options)
    }
    if (! opts.rootDir) {
      console.log('use default memory root dir')
      opts.rootDir = path.join(os.homedir(), '.cruorin')
    }
    return opts
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
      throw new Error('illegal digest')
    }
    var dataDir = path.join(
      this.options.rootDir, 
      digest.slice(0, 2), digest.slice(2, 4)
    )
    var bodyPath = path.join(dataDir, digest)
    var metaPath = bodyPath + '.meta'
    return { root: dataDir, body: bodyPath, meta: metaPath }
  }

  /**
   * get CRC32(buffer)
   * 
   * @param {Buffer} buffer 
   * @returns {String} CRC32(buffer)
   * @memberof Memory
   */
  getDataChecksum(buffer) {
    return crc.crc32(buffer).toString(16)
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
      return this.cache.get(digest)
    }
    var pathmap = this.getFullPath(digest)
    var content = await Promise.all([
      readFile(pathmap.meta, 'utf8').then((content) => JSON.parse(content)),
      readFile(pathmap.body)
    ])
    .catch((error) => {
      throw new Error(`file error <- ${digest}`)
    })
    var [ meta, body ] = content
    if (meta.hash !== this.getDataChecksum(body)) {
      throw new Error(`file error <> ${digest}`)
    }
    var result = new OutgoingMessage({
      status: meta.more.status || 200,
      buffer: body,
      headers: meta.more.headers || {}
    })
    this.cache.set(digest, result)
    return result
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
    var pathmap = this.getFullPath(digest)
    await makeDeepDir(pathmap.root)
    var meta = { 
      hash: this.getDataChecksum(message.buffer),
      more: { status: message.status, headers: message.headers }
    }
    await Promise.all([
      writeFile(pathmap.meta, JSON.stringify(meta)),
      writeFile(pathmap.body, message.buffer)
    ])
    .catch((error) => {
      throw new Error(`file error -> ${digest}`)
    })
  }

  async purgeItem(digest) {
  }
}

module.exports = Memory