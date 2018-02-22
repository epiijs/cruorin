const ACTION = {
  TOTAL: 0,
  CACHE_FETCH: 1,
  CACHE_FETCH_ERROR: 2,
  CACHE_WRITE: 3,
  CACHE_WRITE_ERROR: 4,
  CACHE_PURGE: 5,
  CACHE_PURGE_ERROR: 6,
  PROXY_CREATE_THREAD: 11,
  PROXY_INSERT_ACTION: 12,
  PROXY_FETCH_REQUEST: 13,
  PROXY_FETCH_TIMEOUT: 14
}

const BUFFER = {
  CACHE_FETCH: 1,
  CACHE_WRITE: 3,
  CACHE_PURGE: 5,
  PROXY_FETCH: 13,
}

const MAX_FRAME_TSPAN = 1e3 * 5
const MAX_FRAME_COUNT = 180

const SINGLETON = {}

class Report {
  constructor() {
    this.resetRecord()
    this.frames = []
    this.timer = setInterval(this.writeFrame.bind(this), MAX_FRAME_TSPAN)
  }

  resetRecord() {
    this.record = [{}, {}]
    Object.values(ACTION).forEach(key => this.record[0][key] = 0)
    Object.values(BUFFER).forEach(key => this.record[1][key] = 0)
  }

  recordAction(key) {
    this.record[0][key] ++
  }
  
  recordBuffer(key, value) {
    this.record[1][key] += value
  }

  writeFrame() {
    this.frames.push(this.record)
    this.resetRecord()
    if (this.frames.length === MAX_FRAME_COUNT) {
      console.log('write disk')
    }
  }

  debugFrame() {
    return this.frames
  }
}

function getInstance(options) {
  if (! SINGLETON.report) {
    SINGLETON.report = new Report()
  }
  return SINGLETON.report
}

module.exports = {
  getInstance,
  ACTION, BUFFER
}