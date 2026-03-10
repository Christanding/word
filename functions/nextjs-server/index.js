exports.main = async (event) => {
  // CloudBase Next.js server entry point
  const nextModule = await import('next');
  const next = nextModule.default;
  
  const app = next({
    dev: false,
    dir: __dirname + '/..',
  });
  
  const handle = app.getRequestHandler();
  
  await app.prepare();
  
  return new Promise((resolve) => {
    const req = {
      url: event.path,
      query: event.queryStringParameters,
      method: event.httpMethod,
      headers: event.headers,
      body: event.body,
    };
    
    const res = {
      statusCode: 200,
      headers: {},
      setHeader: function(name, value) {
        this.headers[name] = value;
      },
      end: function(body) {
        resolve({
          statusCode: this.statusCode,
          headers: this.headers,
          body: body,
          isBase64Encoded: false,
        });
      },
    };
    
    handle(req, res);
  });
};
