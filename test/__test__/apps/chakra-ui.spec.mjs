import { join } from "node:path";

import { hostname, page, server, waitForHydration } from "playground/utils";
import { expect, test } from "vitest";

process.chdir(join(process.cwd(), "../examples/chakra-ui"));

test("chakra-ui load", async () => {
  await server(null);
  await page.goto(hostname);
  await page.waitForLoadState("networkidle");

  expect(await page.textContent("body")).toContain("Chakra UI");

  await waitForHydration();

  const button = await page.getByRole("button");
  expect(await button.textContent()).toBe("Hello Chakra UI!");

  let dialogResolver;
  const dialogPromise = new Promise((resolve) => {
    dialogResolver = resolve;
  });
  page.on("dialog", async (dialog) => {
    dialog.accept();
    dialogResolver(dialog);
  });
  await button.click();
  await dialogPromise;
});
