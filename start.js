const { Server } = require('./')

class MyServer extends Server {
  constructor() {
    super({
      
    })
  }
  
  mustSkipCache(message) {
  }

  inferUpstream(message) {
    message.headers.host = message.headers.host.replace('9999', '8080')
    return message
  }

  getCachePolicy(message) {
  }
}

var server = new MyServer()
server.listen(9999, function () {})
