import {
  appDir,
  hostname,
  page,
  server,
  waitForChange,
  waitForHydration,
} from "playground/utils";
import { expect, test } from "vitest";

test("express load", async () => {
  await server("./src/app/index.jsx", {
    base: "/react-server/",
    cwd: appDir("examples/express"),
  });
  await page.goto(hostname + "/react-server/");
  await waitForHydration();
  expect(await page.textContent("body")).toContain("Hello World!");
  const button = await page.getByRole("button");
  await waitForChange(
    () => button.click(),
    () => button.textContent()
  );
  expect(await button.textContent()).toContain("1");
});
