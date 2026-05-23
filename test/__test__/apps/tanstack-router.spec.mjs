import {
  appDir,
  hostname,
  logs,
  page,
  server,
  waitForHydration,
} from "playground/utils";
import { expect, test } from "vitest";

test("tanstack-router load", async () => {
  await server(null, { cwd: appDir("examples/tanstack-router") });
  await page.goto(hostname);
  await page.waitForLoadState("networkidle");
  await waitForHydration();

  expect(await page.textContent("body")).toContain("Welcome Home!");
  expect(logs.join("\n")).not.toContain("Hydration failed");
  expect(logs.join("\n")).not.toContain("reading 'firstId'");
  expect(logs.join("\n")).not.toContain("@tanstack/router-devtools");
});
