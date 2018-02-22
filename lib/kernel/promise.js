/**
 * catch promise reject
 * 
 * @param {Promise} promise 
 * @returns {Promise}
 */
function autoCatch(promise) {
  return promise.catch((error) => {
    return console.log(error.message)
  })
}

/**
 * bind timeout with promise
 * 
 * @param {Promise} promise 
 * @param {Number} timeout 
 * @returns 
 */
function bindTimeout(promise, timeout) {
  return Promise.race([
    new Promise((resolve, reject) => setTimeout(
      () => reject(new Error('timeout')), timeout
    )),
    promise
  ])
}

module.exports = {
  autoCatch,
  bindTimeout
}