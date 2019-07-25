const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const fetch = require('node-fetch');

function getMD5(file, callback) {
  const hash = crypto.createHash('md5');
  const rs = fs.createReadStream(file);
  rs.on('data', hash.update.bind(hash));
  rs.on('end', () => callback(hash.digest('hex')));
}

function sendAndTest(define) {
  const { input, output } = define;
  const options = {
    method: input.verb || 'GET'
  };

  if (input.data) {
    options.headers = {
      'Content-Type': 'application/json'
    };
    options.body = JSON.stringify(input.data);
  }
  return fetch(`http://${input.host || 'localhost'}:${input.port}${input.path}`, options)
    .then((response) => {
      if (output.head != null) {
        Object.keys(output.head).forEach((key) => {
          const value = output.head[key];
          assert.equal(response.headers.get(key), value, 'unexpected head');
        });
      }
      if (output.code != null) {
        assert.equal(response.status, output.code, 'unexpected code');
      }
      if (output.mime != null) {
        assert(response.headers.get('content-type').includes(output.mime), 'unexpected mime');
      }
      if (output.file != null && output.hash != null) {
        getMD5(output.file, (hash) => {
          assert.equal(hash, output.hash, 'unexpected hash');
        });
        // throw new Error('skip other');
      }
      return response.text();
    })
    .then((text) => {
      if (output.text != null) {
        console.log(text);
        assert.equal(text.trim(), output.text.trim(), 'unexpected text');
      }
      if (output.file != null) {
        const content = fs.readFileSync(output.file, 'utf-8');
        assert.equal(text.trim(), content.trim(), 'unexpected file');
      }
      if (output.json != null) {
        const json = JSON.parse(text);
        if (typeof output.json === 'object') {
          assert.equal(
            JSON.stringify(json),
            JSON.stringify(output.json).trim(),
            'unexpected json'
          );
        } else {
          assert.equal(json.state, output.json, 'unexpected json');
        }
      }
    });
}

module.exports = {
  sendAndTest
};
