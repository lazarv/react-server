import { join } from "node:path";

import { hostname, page, server } from "playground/utils";
import { expect, test } from "vitest";

process.chdir(join(process.cwd(), "../examples/env"));
process.env.REACT_SERVER_VALUE = "1";

test("env load", async () => {
  await server("./App.jsx");
  await page.goto(hostname);

  const bodyText = await page.textContent("body");
  expect(bodyText).toContain("__APP_ENV__: development");

  if (process.env.NODE_ENV === "development") {
    expect(bodyText).toContain(`"MY_SECRET_VALUE": "super_secret_value"`);
    expect(bodyText).toContain(`"APP_ENV": "development"`);
    expect(bodyText).toContain(`"APP_PORT": "${server.port}"`);
  }

  expect(bodyText).toContain(`"VITE_API_KEY": "your_api_key_here"`);
  expect(bodyText).toContain(`"VITE_API_URL": "https://api.example.com"`);

  expect(bodyText).toContain(`"REACT_SERVER_API_KEY": "your_api_key_here"`);
  expect(bodyText).toContain(
    `"REACT_SERVER_API_URL": "https://api.example.com"`
  );
  expect(bodyText).toContain(`"REACT_SERVER_VALUE": "1"`);
});
