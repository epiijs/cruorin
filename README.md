# Cruorin

[![Build Status](https://travis-ci.org/gaapx/cruorin.svg?branch=master)](https://travis-ci.org/gaapx/cruorin)
[![Coverage Status](https://coveralls.io/repos/github/gaapx/cruorin/badge.svg?branch=master)](https://coveralls.io/github/gaapx/cruorin?branch=master)

`Cruorin` is a lightweight extensible cache proxy server.

![cruorin1](https://raw.githubusercontent.com/gaapx/cruorin/master/docs/cruorin1.svg)

`Cruorin` provides an efficient proxy mechanism by reducing concurrent requests into one request and exposes necessary hooks to control the proxy flow and cache policy. All hooks only operate simplify request and response concept called `IncomingMessage` and `OutgonigMessage`.

`Cruorin` only proxy and cache `GET` requests. Cache will be persisted by writing to file and cache key is hash of incoming message URL with host.  

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

**Required.**  
`reviseRequest` is invoked before transmitting message.  
`Cruorin` will use revised incoming message to emit request and generate internal request hash as cache key.  

### canCacheError(message): boolean

**Optional, default `false`.**  
`canCacheError` is invoked before writing cache.  
`true` means that 4xx / 5xx error responses will be cached.

### getCachePolicy(message): policy { maxage, pragma }

**Optional, default `{ maxage: 3600, pragma: public }`.**  
`maxage` uses milliseconds.  
`getCachePolicy` is invoked before writing cache.  
Cache policy can be set for specified request.

### mustSkipCache(message): boolean

**Optional, default `false`.**  
`mustSkipCache` is invoked before looking up cache.  
`true` means NO cache.

### mustWaitAgent(message): boolean

**Optional, default `true`.**  
`false` means that `Cruorin` will NOT wait for upstream and output a temporary message immediately before upstream responding.
