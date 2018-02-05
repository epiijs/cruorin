const http = require('http')

http.createServer(function (request, response) {
  response.end('cruorin')
}).listen(8080)