import { hostname, page, server, serverLogs } from "playground/utils";
import { expect, test } from "vitest";

test("http context", async () => {
  await server("fixtures/http-context.jsx");
  await page.goto(hostname);
  const body = await page.textContent("body");
  expect(body).toContain("GET");
  expect(body).toContain(hostname);
  expect(body).toContain("text/html");
});

test("http url", async () => {
  await server("fixtures/http-url.jsx");
  await page.goto(hostname + "?query=foobar");
  expect(await page.textContent("body")).toContain(hostname);
  expect(await page.textContent("body")).toContain(`{"query":"foobar"}`);
});

test("http pathname and searchparams", async () => {
  await server("fixtures/http-pathname-searchparams.jsx");
  await page.goto(hostname + "/pathname?query=foobar");
  expect(await page.textContent("body")).toContain("/pathname");
  expect(await page.textContent("body")).toContain(`{"query":"foobar"}`);

  await page.goto(hostname + "/pathname?query=foobar&query=barfoo");
  expect(await page.textContent("body")).toContain("/pathname");
  expect(await page.textContent("body")).toContain(
    `{"query":["foobar","barfoo"]}`
  );
});

test("http status", async () => {
  await server("fixtures/http-status.jsx");
  const response = await page.goto(hostname);
  expect(response.status()).toBe(404);
  expect(await page.textContent("body")).toContain("Not Found");
});

test("http response", async () => {
  await server("fixtures/http-response.jsx");
  const response = await page.goto(hostname);
  expect(await response.allHeaders()).toMatchObject({
    "x-custom": "custom-value",
  });
  expect(serverLogs).toContain("x-custom custom-value");
});

test("http response headers", async () => {
  await server("fixtures/http-headers.jsx");
  const response = await page.goto(hostname);
  expect(await response.allHeaders()).toMatchObject({
    "x-custom-header": "custom-value",
    "x-another-header": "another-value",
  });
});

test("http response headers append", async () => {
  await server("fixtures/http-headers-append.jsx");
  const response = await page.goto(hostname);
  expect(await response.allHeaders()).toMatchObject({
    "x-custom-header": "custom-value, another-value",
    "cache-control": "must-revalidate, max-age=10",
  });
});

test("http response headers set", async () => {
  await server("fixtures/http-headers-set.jsx");
  const response = await page.goto(hostname);
  expect(await response.allHeaders()).toMatchObject({
    "x-custom-header": "another-value",
    "cache-control": "max-age=10",
  });
});

test("http render lock", async () => {
  await server("fixtures/render-lock.jsx");
  const response = await page.goto(hostname);
  expect(await response.allHeaders()).toMatchObject({
    "x-wait": "works",
    "x-suspend-resume": "works",
  });
});

test("http cookies", async () => {
  await server("fixtures/http-cookies.jsx");
  const response = await page.goto(hostname);
  expect(await response.allHeaders()).toMatchObject({
    "set-cookie": "cookie-name=cookie-value",
  });
});

test("http redirect", async () => {
  await server("fixtures/http-redirect.jsx");
  const response = await page.goto(hostname);
  expect(response.request().url()).toBe(hostname + "/redirected");
  expect(await page.textContent("body")).toContain("Redirected");
});

test("http rewrite", async () => {
  await server("fixtures/http-rewrite.jsx");
  await page.goto(hostname);
  expect(await page.textContent("body")).toContain("/rewrite");
});

// this is flaky so we need to skip it for now
test.skip("http response cache", async () => {
  await server("fixtures/http-response-cache.jsx");
  await page.goto(hostname);
  const first = await page.textContent("body");
  await page.waitForTimeout(500);
  await page.goto(hostname);
  const second = await page.textContent("body");
  expect(first).toBe(second);
  await page.waitForTimeout(500);
  await page.goto(hostname);
  const third = await page.textContent("body");
  expect(first).not.toBe(third);
});

test("http response cache search params", async () => {
  await server("fixtures/http-response-cache.jsx");
  await page.goto(hostname);
  const first = await page.textContent("body");
  await page.goto(hostname + "?query=foobar");
  const second = await page.textContent("body");
  expect(first).not.toBe(second);
});

test("http revalidate", async () => {
  await server("fixtures/http-response-cache.jsx");
  await page.goto(hostname);
  const first = await page.textContent("body");
  await page.goto(hostname);
  const second = await page.textContent("body");
  expect(first).toBe(second);
  await page.route(hostname, (route) => {
    const headers = route.request().headers();
    headers["x-revalidate"] = "true";
    route.continue({ headers });
  });
  await page.goto(hostname);
  const third = await page.textContent("body");
  expect(first).not.toBe(third);
});
