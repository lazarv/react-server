import { hostname, page, server } from "playground/utils";
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
  await page.goto(hostname);
  expect(await page.textContent("body")).toContain(hostname);
});

test("http status", async () => {
  await server("fixtures/http-status.jsx");
  const response = await page.goto(hostname);
  expect(response.status()).toBe(404);
  expect(await page.textContent("body")).toContain("Not Found");
});

test("http response headers", async () => {
  await server("fixtures/http-headers.jsx");
  const response = await page.goto(hostname);
  expect(await response.allHeaders()).toMatchObject({
    "x-custom-header": "custom-value",
    "x-another-header": "another-value",
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
