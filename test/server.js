const http = require('http');

const state = {
  helloCount: 0,
  cacheCount: 0,
  errorCount: 0
};

const server = http.createServer((request, response) => {
  const { url } = request;
  if (url === '/hello') {
    response.writeHead(200);
    response.end('/hello ' + state.helloCount);
    state.helloCount += 1;
    return console.log('[mock]', 'hello');
  }
  if (url === '/cache') {
    response.writeHead(200);
    response.end('/cache ' + state.cacheCount);
    state.cacheCount += 1;
    return console.log('[mock]', 'cache');
  }
  if (url === '/error') {
    response.writeHead(400);
    response.end('/error ' + state.errorCount);
    state.errorCount += 1;
    return console.log('[mock]', 'error');
  }
  if (url === '/timer') {
    setTimeout(() => {
      console.log('[mock]', 'timer');
      response.end('/timer');
    }, 1000);
  }
});

module.exports = server;
