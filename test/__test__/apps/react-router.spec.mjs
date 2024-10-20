import { join } from "node:path";

import { hostname, page, server, waitForHydration } from "playground/utils";
import { expect, test } from "vitest";

process.chdir(join(process.cwd(), "../examples/react-router"));

test("react-router load", async () => {
  await server("./src/index.jsx");
  await page.goto(hostname);
  await page.waitForLoadState("networkidle", { timeout: 5000 });
  await waitForHydration();
  await page.waitForSelector("text=/React Router/", { state: "visible" });
  expect(await page.textContent("body")).toContain("React Router");
});
