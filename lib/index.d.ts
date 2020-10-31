declare namespace cruorin {
  interface IncomingMessage {
    url: string,
    method: string,
    headers: any,
    protocol: string
  }

  interface Options {
    rootdir?: string,
    timeout?: number,
  }

  class Server {
    constructor(options?: Options);

    listen(port: number, callback?: () => void): void;

    reviseRequest(message: IncomingMessage): IncomingMessage;
  
    willApplyCache(message: IncomingMessage): boolean;
  
    willAwaitAgent(message: IncomingMessage): boolean;
  }
}

export = cruorin;