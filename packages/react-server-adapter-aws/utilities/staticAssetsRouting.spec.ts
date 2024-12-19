import { expect, test, vi } from "vitest";

import { getHandler } from "./staticAssetsRouting.mjs";

const createcfMock = () => ({ updateRequestOrigin: vi.fn() });
const createKVSMock = (data) => ({
  get: vi.fn((key) => {
    const value = data?.[key];
    if (!value) {
      throw new Error(`Key not found: ${key}`);
    }
  }),
});

const domainNameOrginStaticAssets = "xxx.s3.eu-west-1.amazonaws.com";

const baseImgHeaders = {
  accept: {
    value: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  },
  host: {
    value: "yyyy.cloudfront.net",
  },
};
const baseHtmlHeaders = {
  accept: {
    value:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  },
  host: {
    value: "yyyy.cloudfront.net",
  },
};
const baseEvent = (uri?: string, header?: any) => ({
  version: "1.0",
  context: {
    distributionDomainName: "d111111abcdef8.cloudfront.net",
    distributionId: "EDFDVBD6EXAMPLE",
    eventType: "viewer-response",
    requestId: "EXAMPLEntjQpEXAMPLE_SG5Z-EXAMPLEPmPfEXAMPLEu3EqEXAMPLE==",
  },
  viewer: { ip: "198.51.100.11" },
  request: {
    method: "GET",
    uri: uri ?? "/",
    querystring: {},
    headers: header ?? baseHtmlHeaders,
    cookies: {},
  },
  response: {
    statusCode: 200,
    statusDescription: "OK",
    headers: {
      date: { value: "Mon, 04 Apr 2021 18:57:56 GMT" },
      server: { value: "gunicorn/19.9.0" },
      "access-control-allow-origin": { value: "*" },
      "access-control-allow-credentials": { value: "true" },
      "content-type": { value: "application/json" },
      "content-length": { value: "701" },
    },
    cookies: {},
  },
});

test("redirect existing directory path to s3 origin", async () => {
  const kvsMock = createKVSMock({ "s/hello/index.html": "s" });
  const cfMock = createcfMock();
  const handler = getHandler(cfMock, kvsMock, domainNameOrginStaticAssets);

  const result = await handler(baseEvent("/s/hello"));

  expect(cfMock.updateRequestOrigin).toHaveBeenCalledOnce();
  expect(result.uri).toBe("/s/hello/index.html");
});

test("redirect existing path to s3 origin", async () => {
  const kvsMock = createKVSMock({ "s/hello/index.html": "s" });
  const cfMock = createcfMock();
  const handler = getHandler(cfMock, kvsMock, domainNameOrginStaticAssets);

  const result = await handler(baseEvent("/s/hello/index.html"));

  expect(cfMock.updateRequestOrigin).toHaveBeenCalledOnce();
  expect(result.uri).toBe("/s/hello/index.html");
});

test("redirect existing path to s3 origin (non html)", async () => {
  const kvsMock = createKVSMock({ "static/images/logo.svg": "s" });
  const cfMock = createcfMock();
  const handler = getHandler(cfMock, kvsMock, domainNameOrginStaticAssets);

  const result = await handler(
    baseEvent("/static/images/logo.svg", baseImgHeaders)
  );

  expect(cfMock.updateRequestOrigin).toHaveBeenCalledOnce();
  expect(result.uri).toBe("/static/images/logo.svg");
});

test("unmodified non static uri (root)", async () => {
  const kvsMock = createKVSMock({});
  const cfMock = createcfMock();
  const handler = getHandler(cfMock, kvsMock, domainNameOrginStaticAssets);

  const uri = "/";

  const result = await handler(baseEvent(uri));

  expect(kvsMock.get).toHaveBeenCalledOnce();
  expect(cfMock.updateRequestOrigin).not.toHaveBeenCalled();
  expect(result.uri).toBe(uri);
});

test("unmodified non static uri (/dynamic)", async () => {
  const kvsMock = createKVSMock({});
  const cfMock = createcfMock();
  const handler = getHandler(cfMock, kvsMock, domainNameOrginStaticAssets);

  const uri = "/dynamic";

  const result = await handler(baseEvent(uri));

  expect(kvsMock.get).toHaveBeenCalledOnce();
  expect(cfMock.updateRequestOrigin).not.toHaveBeenCalled();
  expect(result.uri).toBe(uri);
});

test("unmodified non static uri (/dynamic/index.html)", async () => {
  const kvsMock = createKVSMock({});
  const cfMock = createcfMock();
  const handler = getHandler(cfMock, kvsMock, domainNameOrginStaticAssets);

  const uri = "/dynamic/index.html";

  const result = await handler(baseEvent(uri));

  expect(kvsMock.get).toHaveBeenCalledOnce();
  expect(cfMock.updateRequestOrigin).not.toHaveBeenCalled();
  expect(result.uri).toBe(uri);
});

test("unmodified non static uri (/api/image)", async () => {
  const kvsMock = createKVSMock({});
  const cfMock = createcfMock();
  const handler = getHandler(cfMock, kvsMock, domainNameOrginStaticAssets);

  const uri = "/api/image";

  const result = await handler(baseEvent(uri, baseImgHeaders));

  expect(kvsMock.get).toHaveBeenCalledOnce();
  expect(cfMock.updateRequestOrigin).not.toHaveBeenCalled();
  expect(result.uri).toBe(uri);
});
