import { join } from "node:path";

import { hostname, page, server, waitForChange } from "playground/utils";
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

  await page.goto(`${hostname}/forms`);
  await page.waitForLoadState("networkidle");
  const titleInput = await page.$('input[name="title"]');
  const noteInput = await page.$('textarea[name="note"]');
  await titleInput.fill("Test Title");
  await noteInput.fill("This is a test note.");
  const prevBody = await page.textContent("body");
  await page.click('button[type="submit"]');
  await page.waitForLoadState("networkidle");
  await waitForChange(null, () => page.textContent("body"), prevBody);
  expect(await page.textContent("body")).toContain(
    "Welcome to the File Router Example"
  );
});
