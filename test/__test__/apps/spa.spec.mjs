import { join } from "node:path";

import { hostname, page, server, waitForHydration } from "playground/utils";
import { expect, test } from "vitest";

process.chdir(join(process.cwd(), "../examples/spa"));

test("single-page application load", async () => {
  await server("./src/index.jsx");
  await page.goto(hostname);
  await waitForHydration();
  expect(await page.getByText("single-page application").isVisible()).toBe(
    true
  );
});
