import {
  appDir,
  hostname,
  page,
  server,
  waitForHydration,
} from "playground/utils";
import { expect, test } from "vitest";

test("single-page application load", async () => {
  await server("./src/index.jsx", { cwd: appDir("examples/spa") });
  await page.goto(hostname);
  await waitForHydration();

  const title = page.getByText("single-page application");
  await title.waitFor({ state: "visible" });
  expect(await title.isVisible()).toBe(true);
});
