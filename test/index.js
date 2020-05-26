/* global describe it */

const server = require('./server.js');
const sender = require('./sender.js');
const { Tester } = require('./tester.js');

server.listen(8080);

describe('simple proxy', () => {
  let tester;

  it('start proxy', () => {
    tester = new Tester();
    tester.listen(9999);
  });

  it('proxy hello', () => sender.sendAndTest({
    input: {
      port: 9999,
      host: 'localhost',
      path: '/hello'
    },
    output: {
      code: 200,
      text: '/hello 0'
    }
  }));

  it('proxy hello again, cache not found', () => sender.sendAndTest({
    input: {
      port: 9999,
      host: '127.0.0.1',
      path: '/hello'
    },
    output: {
      code: 200,
      text: '/hello 1'
    }
  }));

  it('proxy cache, cache write', () => sender.sendAndTest({
    input: {
      port: 9999,
      path: '/cache'
    },
    output: {
      code: 200,
      text: '/cache 0'
    }
  }));

  it('proxy cache again, cache found', () => sender.sendAndTest({
    input: {
      port: 9999,
      path: '/cache'
    },
    output: {
      code: 200,
      text: '/cache 0'
    }
  }));

  it('proxy error', () => sender.sendAndTest({
    input: {
      port: '9999',
      path: '/error'
    },
    output: {
      code: 400,
      text: '/error 0'
    }
  }));

  it('proxy error again, cache not found', () => sender.sendAndTest({
    input: {
      port: 9999,
      path: '/error'
    },
    output: {
      code: 400,
      text: '/error 1'
    }
  }));

  it('purge cache, succeeded', () => sender.sendAndTest({
    input: {
      port: 9999,
      path: '/cache',
      verb: 'DELETE'
    },
    output: {
      code: 200,
      text: 'localhost:8080/cache purged'
    }
  }));

  it('try to POST, failed', () => sender.sendAndTest({
    input: {
      port: '9999',
      path: '/try-to-post',
      verb: 'POST'
    },
    output: {
      code: 405
    }
  }));
});
