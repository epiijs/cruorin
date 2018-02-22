const http = require('http')

http.createServer((request, response) => {
  var url = request.url
  if (/error/.test(url)) {
    response.writeHead(400)
    response.end('wulawula')
    return console.log('[mock]', 'error')
  }
  setTimeout(function () {
    console.log('[mock]', 'url', url)
    response.end('test')
  }, 1000)
}).listen(8080)