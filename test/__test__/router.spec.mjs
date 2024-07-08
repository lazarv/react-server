import { hostname, page, server } from "playground/utils";
import { expect, test } from "vitest";

test("router", async () => {
  await server("fixtures/router.jsx");
  await page.goto(hostname);
  expect(await page.textContent("body")).toContain("Home");
  await page.goto(hostname + "/first");
  expect(await page.textContent("body")).toContain("First");
  await page.goto(hostname + "/second");
  expect(await page.textContent("body")).toContain("Second");
  await page.goto(hostname + "/third");
  expect(await page.textContent("body")).toContain("Third");
  await page.goto(hostname + "/not-found");
  expect(await page.textContent("body")).toContain("Not Found");
  await page.goto(hostname + "/first/second");
  expect(await page.textContent("body")).toContain("First");
});
