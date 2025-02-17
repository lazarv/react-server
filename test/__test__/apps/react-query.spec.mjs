import { join } from "node:path";

import { expect } from "@playwright/test";
import { hostname, page, server, waitForHydration } from "playground/utils";
import { test } from "vitest";

process.chdir(join(process.cwd(), "../examples/react-query"));

test("react-query load", async () => {
  await server(null);
  await page.goto(hostname);
  await page.waitForLoadState("networkidle");
  await waitForHydration();
  await expect(page.locator("css=.post-card")).toHaveCount(100);
  await expect(page.locator("css=.comment-card")).toHaveCount(500);
});
