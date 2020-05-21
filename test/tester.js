/* eslint-disable */

const { Server } = require('../');

class Tester extends Server {
  mustSkipCache(message) {
    if (message.url === '/hello') return true;
    return false;
  }

  inferUpstream(message) {
    message.headers.host = message.headers.host.replace('9999', '8080');
    return message;
  }
}

module.exports = {
  Tester
};
