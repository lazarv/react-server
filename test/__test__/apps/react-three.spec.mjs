import {
  appDir,
  hostname,
  page,
  server,
  waitForHydration,
} from "playground/utils";
import { expect, test } from "vitest";

test("react-three load", async () => {
  await server("./App.jsx", { cwd: appDir("examples/react-three") });
  await page.goto(hostname);
  await page.waitForLoadState("networkidle");
  await waitForHydration();

  expect(await page.title()).toBe("React Three Fiber + React Server");
  expect(await page.textContent("h1")).toContain("React Three Fiber");

  // @react-three/fiber mounts a <canvas> element when the client component renders
  const canvas = page.locator("canvas");
  await canvas.waitFor({ state: "visible", timeout: 10000 });
  expect(await canvas.count()).toBe(1);
});
