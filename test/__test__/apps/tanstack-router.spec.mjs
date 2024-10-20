import { join } from "node:path";

import { hostname, page, server, waitForHydration } from "playground/utils";
import { expect, test } from "vitest";

process.chdir(join(process.cwd(), "../examples/tanstack-router"));

test("tanstack-router load", async () => {
  await server(null);
  await page.goto(hostname);
  await page.waitForLoadState("networkidle");
  await waitForHydration();

  expect(await page.textContent("body")).toContain("TanStack Router");
});
