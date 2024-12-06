import { join } from "node:path";

import { hostname, page, server, waitForHydration } from "playground/utils";
import { expect, test } from "vitest";

process.chdir(join(process.cwd(), "../examples/mui"));

test("mui load", async () => {
  await server(null);
  await page.goto(hostname);
  await page.waitForLoadState("networkidle");
  await page.waitForSelector("text=/Material UI/", { state: "visible" });
  expect(await page.textContent("body")).toContain("Material UI");

  await waitForHydration();

  const about = await page.getByRole("link", { name: "Go to the about page" });
  await about.click();

  expect(page.url()).toEqual(new URL("/about", hostname).href);

  await page.waitForLoadState("networkidle");
  await waitForHydration();

  const home = await page.getByRole("link", { name: "Go to the home page" });
  await home.click();

  expect(page.url()).toEqual(new URL("/", hostname).href);
});
