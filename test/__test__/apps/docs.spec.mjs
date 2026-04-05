import { join } from "node:path";

import { hostname, page, server } from "playground/utils";
import { expect, test } from "vitest";

process.chdir(join(process.cwd(), "../docs"));

test(
  "docs load",
  {
    timeout: 120000,
  },
  async () => {
    await server(null, undefined, undefined, 120000);
    await page.goto(hostname);
    await page.waitForLoadState("networkidle");

    expect(await page.textContent("body")).toContain("react-server");
  }
);
