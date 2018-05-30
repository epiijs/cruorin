# Cruorin

`Cruorin` is a lightweight extensible cache proxy server.

## Start

`IncomingMessage` = `Request`.  
`OutgoingMessage` = `Response`.  

TODO - place chart here.

## Usage

### install as dependency

`npm install --save cruorin`

### write proxy & cache policies

```js
const { Server } = require('cruorin');

class MyServer extends Server {
  inferUpstream(message) {
    message.headers.host = message.headers.host.replace('9999', '8080');
    return message;
  }
}

const server = new MyServer();
server.listen(9999, function () {})
```

## Policy

### reviseRequest

To revise request for internal request id.

### inferUpstream

To infer upstream and edit request.

### getCachePolicy

To set response cache headers for specified request.

### mustSkipCache

To skip cache for specified request.

### mustWaitAgent

To skip agent for specified request.  

### mustSkipError

To ignore response error for agent and cache.