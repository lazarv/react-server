#!/usr/bin/env node

import { existsSync } from "node:fs";
import { argv } from "node:process";

const requestHandlerPath =
  "../.aws-react-server/output/functions/index.func/index.mjs";

const firstParameter = argv[2];
if (firstParameter === "-h" || firstParameter === "--help") {
  console.log(`
Usage: ${argv[1]} <request path | -e <path to event.jon> | -h | --help>

You can test the aws handler local without deployment with this script.

examples:
  ${argv[1]} /
  ${argv[1]} -e event.json
`);
  process.exit(1);
}

let eventData = null;
let queryPath = "/";

if (firstParameter === "-e") {
  if (argv.length < 4) {
    console.error("Error: missing path to event.json");
    process.exit(1);
  }
  const eventFilePath = argv[3];
  if (!existsSync(eventFilePath)) {
    console.error(`Error: file not found: ${eventFilePath}`);
    process.exit(1);
  }
  const data = await import(eventFilePath);
  try {
    eventData = JSON.parse(data);
  } catch (e) {
    console.error(`Error '${eventFilePath}': ${e.message}`);
    process.exit(1);
  }
} else {
  queryPath = (firstParameter ?? "/").trim();
}

if (eventData === null) {
  eventData = {
    version: "2.0",
    routeKey: "$default",
    rawPath: queryPath,
    rawQueryString: "",
    headers: {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7", //"*/*",
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
}

const { handler } = await import(requestHandlerPath);

const response = await handler(eventData, {});

console.log(response);
console.log("-".repeat(80));
if (response?.isBase64Encoded === true) {
  console.log(Buffer.from(response.body, "base64").toString());
}
process.exit(0);
