declare namespace cruorin {
  interface IncomingMessage {
    url: string,
    method: string,
    headers: any,
  }

  interface CachePolicy {
    maxage: number,
    action: string
  }

  interface Options {
    rootdir?: string,
    timeout?: number,
  }

  class Server {
    constructor(options?: Options);

    listen(port: number, callback?: () => void): void;

    reviseRequest(message: IncomingMessage): IncomingMessage;

    canCacheError(message: IncomingMessage): boolean;
  
    policyOfCache(message: IncomingMessage): CachePolicy;
  
    mustSkipCache(message: IncomingMessage): boolean;
  
    mustWaitAgent(message: IncomingMessage): boolean;
  }
}

export = cruorin;