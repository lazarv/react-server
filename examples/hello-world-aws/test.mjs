const requestHandlerPath =
  "./.aws-lambda/output/functions/index.func/index.mjs";
const { handler } = await import(requestHandlerPath);
const queryPath = "/";
const eventData = {
  version: "2.0",
  routeKey: "$default",
  rawPath: queryPath,
  rawQueryString: "",
  headers: {
    accept: "*/*",
    "content-length": "0",
    host: "localhost",
    "user-agent": "PostmanRuntime/7.26.8",
    "x-amzn-trace-id": "Root=1-5f84c7a9-0e5b1e1e1e1e1e1e1e1e1e1e",
    "x-forwarded-for": "127.0.0.1",
    "x-forwarded-port": "443",
    "x-forwarded-proto": "https",
  },
  requestContext: {
    accountId: "123456789012",
    apiId: "api-id",
    domainName: "localhost",
    domainPrefix: "example",
    http: {
      method: "GET",
      path: queryPath,
      protocol: "HTTP/1.1",
      sourceIp: "127.0.0.1",
      userAgent: "PostmanRuntime/7.26.8",
    },
    requestId: "id",
    routeKey: "$default",
    stage: "$default",
    time: "12/Mar/2021:19:03:58 +0000",
    timeEpoch: 1615578238000,
  },
  isBase64Encoded: false,
};
const response = await handler(eventData, {});
console.log(response);
