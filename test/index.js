/* global describe it */

const assert = require('assert');
const fetch = require('node-fetch');
const { server, Tester } = require('./server.js');

function fetchProxy(path, method) {
  return fetch('http://localhost:9999' + path, {
    method: method || 'GET'
  });
}

function assertStatus(status) {
  return (response) => {
    assert.strictEqual(status, response.status);
    return response;
  };
}

function assertText(expectedText) {
  return (response) => {
    return response.text().then(text => {
      assert.strictEqual(text, expectedText);
    });
  };
}

describe('simple proxy', () => {
  let tester;

  it('start proxy', () => {
    server.listen(8080);
    tester = new Tester({ rootdir: '/tmp/cruorin' });
    tester.listen(9999);
  });

  it('proxy hello', () => {
    return fetchProxy('/hello')
      .then(assertStatus(200))
      .then(assertText('/hello 0'));
  });

  it('proxy hello again, cache not found', () => {
    return fetchProxy('/hello')
      .then(assertStatus(200))
      .then(assertText('/hello 1'));
  });

  it('proxy cache, cache write', () => {
    return fetchProxy('/cache')
      .then(assertStatus(200))
      .then(assertText('/cache 0'));
  });

  it('proxy cache again, cache found', () => {
    return fetchProxy('/cache')
      .then(assertStatus(200))
      .then(assertText('/cache 0'));
  });

  it('proxy error', () => {
    return fetchProxy('/error')
      .then(assertStatus(400))
      .then(assertText('/error 0'));
  });

  it('proxy error again, cache not found', () => {
    return fetchProxy('/error')
      .then(assertStatus(400))
      .then(assertText('/error 1'));
  });

  it('purge cache, succeeded', () => {
    return fetchProxy('/cache', 'DELETE')
      .then(assertStatus(200))
      .then(assertText('8067bffc95eea7be72c0ef592d05fb85 purged'));
  });

  it('try to POST, failed', () => {
    return fetchProxy('/try-to-post', 'POST')
      .then(assertStatus(405));
  });
});
