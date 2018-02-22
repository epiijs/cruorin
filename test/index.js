const { Server } = require('../')

class MyServer extends Server {
  mustSkipCache(request) {
  }
}

var server1 = new MyServer()
server.listen(9999, function () {})
