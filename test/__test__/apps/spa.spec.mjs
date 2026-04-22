import {
  appDir,
  hostname,
  page,
  server,
  waitForHydration,
} from "playground/utils";
import { expect, test } from "vitest";

test("single-page application load", async () => {
  await server("./src/index.ssr.jsx", { cwd: appDir("examples/spa") });
  await page.goto(hostname);
  await waitForHydration();

  // The "use client" App chrome rendered through the SSR shortcut
  // (renderToReadableStream, no RSC flight pipeline).
  const header = page.getByRole("heading", {
    name: "@lazarv/react-server",
    level: 1,
  });
  await header.waitFor({ state: "visible" });
  expect(await header.isVisible()).toBe(true);

  // Heavy section composed via `children` from index.ssr.jsx rendered
  // too — proves the client-root tree pulls in the directive-free section
  // modules and SSRs them through React DOM.
  const overview = page.getByRole("heading", {
    name: "Overview",
    level: 2,
  });
  await overview.waitFor({ state: "visible" });
  expect(await overview.isVisible()).toBe(true);
});
