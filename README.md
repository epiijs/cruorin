# Cruorin

[![Build Status](https://travis-ci.org/sartrey/cruorin.svg?branch=master)](https://travis-ci.org/sartrey/cruorin)
[![Coverage Status](https://coveralls.io/repos/github/sartrey/cruorin/badge.svg?branch=master)](https://coveralls.io/github/sartrey/cruorin?branch=master)

`Cruorin` is a lightweight extensible cache proxy server.

![cruorin1](https://raw.githubusercontent.com/gaapx/cruorin/master/docs/cruorin1-small.png)

`Cruorin` provides an efficient proxy mechanism by reducing concurrent requests into one request and exposes necessary hooks to control the proxy flow and cache policy. All hooks only operate simplify request and response concept called `IncomingMessage` and `OutgonigMessage`.

`Cruorin` only proxy `GET` requests.

## Usage

### install as dependency

`npm install --save cruorin`

### write proxy & cache policies

```js
const { Server } = require('cruorin');

class MyServer extends Server {
  reviseRequest(message) {
    // => localhost:9999/?ts=1
    // infer upstream
    message.headers.host = message.headers.host.replace('9999', '8080');
    // remove timestamp
    message.url = message.url.replace(/\??ts=[^&]+&?/, '');
    // <= localhost:8080/?
    return message;
  }
}

const server = new MyServer();
server.listen(9999);
```

## API

### reviseRequest(message): message

Required.  
`reviseRequest` is invoked before transmitting message. `Cruorin` will revise request result to request upstream and generate internal request id as cache key.  
You can revise incoming message to apply upstream and reduce cache-unrelated request information.

### canCacheError(message): boolean

Optional, default `false`.  
`canCacheError` is invoked before writing cache. `true` means that 4xx / 5xx error responses will be cached.

### getCachePolicy(message): policy { maxage, pragma }

Optional, default `{ maxage: 3600, pragma: public }`.  
`getCachePolicy` is invoked before writing cache. You can set cache policy for specified request.

### mustSkipCache(message): boolean

Optional, default `false`.  
`mustSkipCache` is invoked before looking up cache. `true` means NO cache.

### mustWaitAgent(message): boolean

Optional, default `true`.  
`false` means that `Cruorin` will not wait for upstream and will output a temporary message immediately before upstream responding.
