import {
  hostname,
  page,
  server,
  serverLogs,
  waitForChange,
} from "playground/utils";
import { expect, test } from "vitest";

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

test("use cache browser", async () => {
  await server("fixtures/use-cache-browser.jsx");
  await page.goto(hostname);

  let start = Date.now();
  const { lru: lru1, ...state } = JSON.parse(await page.textContent("pre"));

  await page.reload();
  const { lru: lru2, ...state2 } = JSON.parse(await page.textContent("pre"));
  expect(state).toEqual(state2);
  expect(lru2).not.toEqual(lru1);

  let nextState = { ...state2 };
  while (nextState.local === state.local) {
    await page.reload();
    nextState = JSON.parse(await page.textContent("pre"));
  }
  expect(Date.now() - start).toBeGreaterThan(1000);
  expect(nextState.session).toEqual(state.session);

  while (nextState.session === state.session) {
    await page.reload();
    nextState = JSON.parse(await page.textContent("pre"));
  }
  expect(Date.now() - start).toBeGreaterThan(2000);
  expect(nextState.indexedb).toEqual(state.indexedb);

  while (nextState.indexedb === state.indexedb) {
    await page.reload();
    nextState = JSON.parse(await page.textContent("pre"));
  }
  expect(Date.now() - start).toBeGreaterThan(3000);

  await waitForChange(null, () => page.textContent("pre"));
  const { lru: lru3 } = JSON.parse(await page.textContent("pre"));
  expect(Date.now() - start).toBeGreaterThan(4000);
  expect(lru3).not.toEqual(lru2);
});

test("rsc serialization", async () => {
  await server("fixtures/rsc.jsx");
  await page.goto(hostname);

  expect(await page.textContent("#serialized")).toContain(
    process.env.NODE_ENV === "production"
      ? `1:I["/client/fixtures/counter.`
      : `4:I["fixtures/counter.jsx",[],"default",1]`
  );
  expect(await page.getByRole("button").count()).toBe(2);
  expect(
    await page.getByRole("button", { name: "0", exact: true }).textContent()
  ).toBe("0");
});
