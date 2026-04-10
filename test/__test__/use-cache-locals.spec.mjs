import { hostname, page, server } from "playground/utils";
import { expect, test } from "vitest";

test("use cache locals", async () => {
  await server("fixtures/use-cache-locals.jsx");
  await page.goto(hostname);

  // Test 1: Function parameter closure — `prefix` captured as a local
  expect(await page.textContent("#greeting")).toBe("Hello: World");

  // Test 2: Destructured variable closure — `locale` and `currency` captured
  expect(await page.textContent("#formatted")).toBe("$42.00");

  // Test 3: Array destructured variable closure — `left` and `right` captured
  expect(await page.textContent("#labeled")).toBe("[test]");

  // Test 4: Exported cached function
  const cachedId = await page.textContent("#cached-id");
  expect(cachedId).toBe("default");

  const cachedTime = await page.textContent("#cached-time");
  expect(cachedTime).toBeTruthy();

  // Verify caching works — reload should return the same cached time
  await page.reload();
  expect(await page.textContent("#cached-time")).toBe(cachedTime);
  expect(await page.textContent("#greeting")).toBe("Hello: World");
  expect(await page.textContent("#formatted")).toBe("$42.00");
  expect(await page.textContent("#labeled")).toBe("[test]");

  // Verify dynamic args work — different id should produce different cached-id
  await page.goto(hostname + "?id=test123");
  expect(await page.textContent("#cached-id")).toBe("test123");
});
