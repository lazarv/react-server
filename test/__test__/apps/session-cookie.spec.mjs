import { join } from "node:path";

import { hostname, page, server, waitForHydration } from "playground/utils";
import { expect, test } from "vitest";

process.chdir(join(process.cwd(), "../examples/session-cookie"));

test("session cookie", async () => {
  await server("./App.jsx", {
    resolve: {
      external: ["iron-session"],
    },
  });

  await page.goto(hostname);
  await page.waitForLoadState("networkidle");
  await waitForHydration();

  let loginButton = page.getByRole("button", { name: "Login" });
  await loginButton.waitFor({ state: "visible" });
  expect(await loginButton.isVisible()).toBe(true);
  await loginButton.click();

  let logoutButton = page.getByRole("button", { name: "Logout" });
  await logoutButton.waitFor({ state: "visible" });
  expect(await logoutButton.isVisible()).toBe(true);
  expect(await page.getByRole("button", { name: "New User" }).isVisible()).toBe(
    false
  );

  await page.goto(hostname);
  await page.waitForLoadState("networkidle");

  logoutButton = page.getByRole("button", { name: "Logout" });
  await logoutButton.waitFor({ state: "visible" });
  expect(await logoutButton.isVisible()).toBe(true);
  await logoutButton.click();

  loginButton = page.getByRole("button", { name: "Login" });
  await loginButton.waitFor({ state: "visible" });
  expect(await loginButton.isVisible()).toBe(true);

  const newUserButton = page.getByRole("button", { name: "New User" });
  await newUserButton.waitFor({ state: "visible" });
  expect(await newUserButton.isVisible()).toBe(true);

  await newUserButton.click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(0);
  expect(await page.textContent("body")).toContain("User code: 100000");

  await newUserButton.click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(100);
  expect(await page.textContent("body")).toContain("User code: 100001");
});
