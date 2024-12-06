import { join } from "node:path";

import { hostname, page, server, waitForHydration } from "playground/utils";
import { expect, test } from "vitest";

process.chdir(join(process.cwd(), "../examples/react-query"));

test("react-query load", async () => {
  await server(null);
  await page.goto(hostname);
  await waitForHydration();
  expect(
    await page.evaluate(() => document.querySelectorAll(".post-card").length)
  ).toEqual(100);
  expect(
    await page.evaluate(() => document.querySelectorAll(".comment-card").length)
  ).toEqual(500);
});
