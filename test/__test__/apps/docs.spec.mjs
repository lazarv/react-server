import { join } from "node:path";

import { hostname, page, server } from "playground/utils";
import { expect, test } from "vitest";

process.chdir(join(process.cwd(), "../docs"));

test("docs load", async () => {
  await server(null);
  await page.goto(hostname);
  await page.waitForLoadState("networkidle");

  expect(await page.textContent("body")).toContain("react-server");
});
