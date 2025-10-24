import { join } from "node:path";

import { hostname, page, server } from "playground/utils";
import { expect, test } from "vitest";

process.chdir(join(process.cwd(), "../examples/file-router"));

test("file-router plugin", async () => {
  await server(null);

  await page.goto(`${hostname}/forms`);
  await page.waitForLoadState("networkidle");
  expect(await page.textContent("body")).toContain("Layout (forms)");
  expect(await page.textContent("body")).not.toContain("Layout (forms simple)");

  await page.goto(`${hostname}/forms-simple`);
  await page.waitForLoadState("networkidle");
  expect(await page.textContent("body")).not.toContain("Layout (forms)");
  expect(await page.textContent("body")).toContain("Layout (forms simple)");
});
