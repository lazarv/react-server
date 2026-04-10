import { hostname, page, server } from "playground/utils";
import { expect, test } from "vitest";

test("use cache sibling scope - no false closure capture across sibling functions", async () => {
  await server("fixtures/use-cache-sibling-scope.jsx");
  await page.goto(hostname);

  // Verify the prepared (non-cached helper → cached function) path works
  expect(await page.textContent("#prepared-label")).toBe("[foo]");
  expect(await page.textContent("#prepared-value")).toBe("42");
  expect(await page.textContent("#prepared-extra")).toBe("bonus");

  const preparedTimestamp = await page.textContent("#prepared-timestamp");
  expect(preparedTimestamp).toBeTruthy();

  // Verify the direct cached function call works
  expect(await page.textContent("#direct-label")).toBe("direct");
  expect(await page.textContent("#direct-value")).toBe("99");
  expect(await page.textContent("#direct-extra")).toBe("none");

  const directTimestamp = await page.textContent("#direct-timestamp");
  expect(directTimestamp).toBeTruthy();

  // Verify caching: reload should return the same cached timestamps
  await page.reload();
  expect(await page.textContent("#prepared-timestamp")).toBe(preparedTimestamp);
  expect(await page.textContent("#direct-timestamp")).toBe(directTimestamp);

  // Verify values still correct after reload
  expect(await page.textContent("#prepared-label")).toBe("[foo]");
  expect(await page.textContent("#prepared-value")).toBe("42");
  expect(await page.textContent("#direct-label")).toBe("direct");
  expect(await page.textContent("#direct-value")).toBe("99");
});
