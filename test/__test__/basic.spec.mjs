import { hostname, logs, page, server, waitForChange } from "playground/utils";
import { expect, test } from "vitest";
import { waitForConsole } from "../utils.mjs";

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
