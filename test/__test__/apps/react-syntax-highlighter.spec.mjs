import {
  appDir,
  hostname,
  page,
  server,
  waitForHydration,
} from "playground/utils";
import { expect, test } from "vitest";

test("react-syntax-highlighter load", async () => {
  await server("./App.jsx", {
    cwd: appDir("examples/react-syntax-highlighter"),
  });
  await page.goto(hostname);
  await page.waitForLoadState("networkidle");
  await waitForHydration();

  await page
    .getByText("react-syntax-highlighter")
    .waitFor({ state: "visible" });
  expect(await page.getByText("react-syntax-highlighter").isVisible()).toBe(
    true
  );

  const serverCode = page.getByText(
    "import { createServer } from 'react-server';"
  );
  await serverCode.waitFor({ state: "visible" });
  expect(await serverCode.isVisible()).toBe(true);

  const clientCode = page.getByText(
    "import { Link } from '@lazarv/react-server/navigation';"
  );
  await clientCode.waitFor({ state: "visible" });
  expect(await clientCode.isVisible()).toBe(true);
});
