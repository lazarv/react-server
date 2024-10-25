import {
  hostname,
  logs,
  page,
  server,
  serverLogs,
  waitForChange,
  waitForConsole,
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

test("client-only counter", async () => {
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
  const color = await h1.evaluate((el) => getComputedStyle(el).color);
  expect(color).toBe("rgb(255, 255, 0)");
  const background = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor
  );
  expect(background).toBe("rgb(0, 0, 255)");
});

test("style assets with base url", async () => {
  await server("fixtures/styles.jsx", { base: "/react-server/" });
  await page.goto(hostname + "/react-server");
  const h1 = await page.getByText("This text should be yellow");
  const color = await h1.evaluate((el) => getComputedStyle(el).color);
  expect(color).toBe("rgb(255, 255, 0)");
  const background = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor
  );
  expect(background).toBe("rgb(0, 0, 255)");
});

test("use cache primitive", async () => {
  await server("fixtures/use-cache-primitive.jsx");
  await page.goto(hostname);
  const time = await page.textContent("body");

  await page.reload();
  expect(await page.textContent("body")).toBe(time);

  await page.waitForTimeout(500);
  await page.reload();
  const newTime = await page.textContent("body");
  expect(newTime).not.toBe(time);

  await page.reload();
  expect(await page.textContent("body")).toBe(newTime);

  await page.goto(hostname + "?force=true");
  expect(await page.textContent("body")).not.toBe(newTime);
});

test("use cache element", async () => {
  await server("fixtures/use-cache-element.jsx");
  await page.goto(hostname);
  const time = await page.textContent("body");

  await page.reload();
  expect(await page.textContent("body")).toBe(time);
});

test("use cache invalidate", async () => {
  await server("fixtures/use-cache-invalidate.jsx");

  const start = Date.now();
  await page.goto(hostname);

  const payload = JSON.parse(await page.textContent("pre"));
  await page.reload();
  expect(await page.textContent("pre")).toContain(payload.timestamp);

  await waitForChange(
    () => page.reload(),
    () => page.textContent("pre")
  );
  const end = Date.now();
  expect(end - start).toBeGreaterThan(5000);

  const newPayload = JSON.parse(await page.textContent("pre"));
  expect(newPayload).not.toContain(payload.timestamp);

  const button = await page.getByRole("button");
  await button.click();

  expect(await page.textContent("pre")).not.toContain(payload.timestamp);
});

test("use cache concurrency", async () => {
  await server("fixtures/use-cache-concurrency.jsx");

  await Promise.all([
    fetch(hostname, { headers: { accept: "text/html" } }),
    fetch(hostname, { headers: { accept: "text/html" } }),
  ]);
  expect(JSON.stringify(serverLogs)).toBe(`["getTodos"]`);
});

test("use cache dynamic", async () => {
  await server("fixtures/use-cache-dynamic.jsx");
  await page.goto(hostname + "?id=1");
  const time = await page.textContent("body");

  await page.reload();
  expect(await page.textContent("body")).toBe(time);

  await page.goto(hostname + "?id=2");
  expect(await page.textContent("body")).not.toBe(time);

  await page.goto(hostname + "?id=1");
  expect(await page.textContent("body")).toBe(time);
});
