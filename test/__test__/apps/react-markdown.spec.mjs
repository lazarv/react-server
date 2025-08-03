import { join } from "node:path";

import { hostname, page, server, waitForHydration } from "playground/utils";
import { expect, test } from "vitest";

process.chdir(join(process.cwd(), "../examples/react-markdown"));

test("react-markdown load", async () => {
  await server("./App.jsx");
  await page.goto(hostname);
  await page.waitForLoadState("networkidle", { timeout: 5000 });
  await waitForHydration();
  await Promise.all([
    page.waitForSelector("text=/Hello Server World/", { state: "visible" }),
    page.waitForSelector("text=/Hello Client World/", { state: "visible" }),
  ]);
  expect(await page.textContent("body")).toContain("Hello Server World");
  expect(await page.textContent("body")).toContain("Hello Client World");
});
