import { hostname, page, server } from "playground/utils";
import { expect, test } from "vitest";

test("memory cache", async () => {
  await server("fixtures/memory-cache.jsx");
  await page.goto(hostname);
  const first = await page.textContent("body");
  await page.waitForTimeout(500);
  await page.goto(hostname);
  const second = await page.textContent("body");
  expect(first).toBe(second);
  await page.waitForTimeout(1500);
  await page.goto(hostname);
  const third = await page.textContent("body");
  expect(first).not.toBe(third);
});

test("memory cache with force", async () => {
  await server("fixtures/memory-cache.jsx");
  await page.goto(hostname);
  const first = await page.textContent("body");
  await page.goto(hostname);
  const second = await page.textContent("body");
  expect(first).toBe(second);
  await page.goto(hostname + "?force");
  const third = await page.textContent("body");
  expect(first).not.toBe(third);
});
