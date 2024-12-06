import { join } from "node:path";

import { hostname, page, server } from "playground/utils";
import { expect, test } from "vitest";

process.chdir(join(process.cwd(), "../examples/todo"));

test("todo load", async () => {
  await server("./src/index.tsx");
  await page.goto(hostname);
  expect(await page.textContent("body")).toContain("Todo");
});
