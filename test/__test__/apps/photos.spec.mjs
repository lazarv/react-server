import { join } from "node:path";

import { hostname, page, server } from "playground/utils";
import { expect, test } from "vitest";

process.chdir(join(process.cwd(), "../examples/photos"));

test("photos load", async () => {
  await server(null);
  await page.goto(hostname);
  expect(await page.textContent("body")).toContain("Photos");
});
