import { appDir, hostname, page, server } from "playground/utils";
import { expect, test } from "vitest";

test("photos load", async () => {
  await server(null, { cwd: appDir("examples/photos") });
  await page.goto(hostname);
  expect(await page.textContent("body")).toContain("Photos");
});
