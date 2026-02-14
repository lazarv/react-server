import {
  hostname,
  logs,
  page,
  server,
  waitForChange,
  waitForConsole,
  waitForHydration,
} from "playground/utils";
import { expect, test } from "vitest";

test("hello world", async () => {
  await server("fixtures/hello-world.jsx");
  await page.goto(hostname);
  expect(await page.textContent("body")).toContain("Hello, world!");
});

test("random", async () => {
  await server("fixtures/random.jsx");
  await page.goto(hostname);
  const run1 = await page.textContent("body");
  await page.reload();
  const run2 = await page.textContent("body");
  expect(run1).not.toBe(run2);
});

async function testCounter() {
  await page.goto(hostname);
  const button = await page.getByRole("button");
  await waitForChange(
    () => button.click(),
    () => page.textContent("body")
  );
  expect(await page.textContent("body")).toContain("1");
  await waitForChange(
    () => button.click(),
    () => page.textContent("body")
  );
  expect(await page.textContent("body")).toContain("2");
}

test("counter", async () => {
  await server("fixtures/counter.jsx");
  await testCounter();
});

test("html and counter", async () => {
  await server("fixtures/html-counter.jsx");
  await testCounter();
});

async function testClientOnly() {
  const response = await page.goto(hostname);
  expect(await response.text()).not.toContain("<button");
  const button = await page.getByRole("button");
  await button.isVisible();
  await waitForChange(
    () => button.click(),
    () => page.textContent("body")
  );
  expect(await page.textContent("body")).toContain("1");
}

test("bare client-only counter", async () => {
  await server("fixtures/client-only.jsx");
  await testClientOnly();
});

test("html and client-only counter", async () => {
  await server("fixtures/html-client-only.jsx");
  await testClientOnly();
});

for (const id of [
  "inline-jsx-prop",
  "inline-server-action-function",
  "inline-server-action-arrow",
  "inline-server-action-top-level",
  "server-action",
  "call-action-prop",
  "call-action-import",
]) {
  test(`${id} server action`, async () => {
    await server("fixtures/server-actions.jsx");
    await page.goto(hostname);

    const button = await page.getByTestId(id);

    await waitForChange(
      () => button.click(),
      () => logs.includes(`submitted ${id}!`)
    );
    expect(logs).toContain(`submitted ${id}!`);

    if (id.startsWith("call-action")) {
      await waitForConsole(() => logs.includes(`action result ${id}`));
      expect(logs).toContain(`action result ${id}`);
    }
  });
}

test(`server action state`, async () => {
  await server("fixtures/server-action-state.jsx");
  await page.goto(hostname);

  const input = await page.getByRole("textbox");
  const button = await page.getByRole("button");

  await input.type("react-server");

  await waitForChange(
    () => button.click(),
    () => logs.includes("update name to react-server")
  );
  expect(logs).toContain("update name to react-server");

  await page.reload();
  const h1 = await page.getByText("Welcome, react-server!");

  expect(await h1.isVisible()).toBe(true);
});

test("useActionState hook using server action", async () => {
  await server("fixtures/use-action-state.jsx");
  await page.goto(hostname);
  await waitForHydration();

  const input = await page.getByRole("textbox");
  await input.type("react-server");

  const button = await page.getByRole("button");
  await button.click();

  await waitForConsole(() => logs.includes("submitted useActionState!"));
  expect(logs).toContain("submitted useActionState!");
  expect(logs).toContain("hello react-server");
  expect(await page.textContent("pre")).toContain('"react-server"');
});

test("style assets", async () => {
  await server("fixtures/styles.jsx");
  await page.goto(hostname);
  const h1 = await page.getByText("This text should be yellow");
  await expect
    .poll(() => h1.evaluate((el) => getComputedStyle(el).color), {
      timeout: 5000,
    })
    .toBe("rgb(255, 255, 0)");
  await expect
    .poll(
      () =>
        page.evaluate(() => getComputedStyle(document.body).backgroundColor),
      { timeout: 5000 }
    )
    .toBe("rgb(0, 0, 255)");
});

test("style assets with base url", async () => {
  await server("fixtures/styles.jsx", undefined, "/react-server/");
  await page.goto(hostname + "/react-server");
  const h1 = await page.getByText("This text should be yellow");
  await expect
    .poll(() => h1.evaluate((el) => getComputedStyle(el).color), {
      timeout: 5000,
    })
    .toBe("rgb(255, 255, 0)");
  await expect
    .poll(
      () =>
        page.evaluate(() => getComputedStyle(document.body).backgroundColor),
      { timeout: 5000 }
    )
    .toBe("rgb(0, 0, 255)");
});

test("suspense client", async () => {
  await server("fixtures/suspense-client.jsx");
  await page.goto(hostname);
  await waitForHydration();

  if (process.env.NODE_ENV === "production") {
    const scripts = await page.$$("script[src]");
    expect(scripts.length).toBe(1);
    expect(await scripts[0].getAttribute("src")).toContain("/client/index");
  } else {
    const button = await page.getByRole("button");
    await button.click();
    expect(logs).toContain("use client");
    await waitForChange(
      () => {},
      () => page.$$("script")
    );
    const scripts = await page.$$("script[src]");
    // this is flaky and needs a stable solution
    expect(scripts.length).toBeGreaterThanOrEqual(3);
    expect(await scripts[0].getAttribute("src")).toBe("/@vite/client");
    expect(await scripts[1].getAttribute("src")).toBe("/@hmr");
    expect(await scripts[2].getAttribute("src")).toBe("/@__webpack_require__");
  }
});

test("resolve builtin module import", async () => {
  await server("fixtures/builtin-import.jsx");
  await page.goto(hostname);
  expect(await page.textContent("body")).toContain(
    "react/react.react-server.js"
  );
});

test("navigation location", async () => {
  await server("fixtures/navigation-location.jsx");
  await page.goto(`${hostname}/pathname?foo=bar`);
  expect(await page.textContent("body")).toContain("/pathname");
  expect(await page.textContent("body")).toContain(`{"foo":"bar"}`);
});
