import {
  appDir,
  hostname,
  page,
  server,
  waitForHydration,
} from "playground/utils";
import { expect, test } from "vitest";

test("react-modal load", async () => {
  await server("./App.jsx", { cwd: appDir("examples/react-modal") });
  await page.goto(hostname);
  await page.waitForLoadState("networkidle");
  await waitForHydration();

  const showModal = page.getByText("Show Modal");
  await showModal.waitFor({ state: "visible" });
  expect(await showModal.isVisible()).toBe(true);

  await showModal.click();
  const hideModal = page.getByText("Hide Modal");
  await hideModal.waitFor({ state: "visible" });
  expect(await hideModal.isVisible()).toBe(true);

  await hideModal.click();
  await showModal.waitFor({ state: "visible" });
  expect(await showModal.isVisible()).toBe(true);
});
