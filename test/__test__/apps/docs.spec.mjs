import { appDir, hostname, page, server } from "playground/utils";
import { expect, test } from "vitest";

test(
  "docs load",
  {
    timeout: 120000,
  },
  async () => {
    await server(null, { timeout: 120000, cwd: appDir("docs") });
    await page.goto(hostname);
    await page.waitForLoadState("networkidle");

    expect(await page.textContent("body")).toContain("react-server");
  }
);
