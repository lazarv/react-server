import {
  hostname,
  page,
  server,
  serverLogs,
  waitForChange,
  waitForHydration,
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

  async function getPreJSON() {
    const raw = await page.textContent("pre");
    try {
      return JSON.parse(raw);
    } catch {
      const html = await page.content();
      throw new Error(
        `Failed to parse <pre> content as JSON.\n` +
          `<pre> text: ${raw}\n` +
          `Full page HTML:\n${html}`
      );
    }
  }

  let start = Date.now();
  const { lru: lru1, ...state } = await getPreJSON();

  await page.reload();
  const { lru: lru2, ...state2 } = await getPreJSON();
  expect(state).toEqual(state2);
  expect(lru2).not.toEqual(lru1);

  let nextState = { ...state2 };
  while (nextState.local === state.local) {
    await page.reload();
    nextState = await getPreJSON();
  }
  expect(Date.now() - start).toBeGreaterThan(1000);
  expect(nextState.session).toEqual(state.session);

  while (nextState.session === state.session) {
    await page.reload();
    nextState = await getPreJSON();
  }
  expect(Date.now() - start).toBeGreaterThan(2000);
  expect(nextState.indexedb).toEqual(state.indexedb);

  while (nextState.indexedb === state.indexedb) {
    await page.reload();
    nextState = await getPreJSON();
  }
  expect(Date.now() - start).toBeGreaterThan(3000);

  await waitForChange(null, () => page.textContent("pre"));
  const { lru: lru3 } = await getPreJSON();
  expect(Date.now() - start).toBeGreaterThan(4000);
  expect(lru3).not.toEqual(lru2);
});

test("use cache browser component", async () => {
  await server("fixtures/use-cache-browser-component.jsx");
  await page.goto(hostname);
  await page.waitForLoadState("networkidle");

  // Verify the cached React component tree rendered correctly
  const greeting = await page.textContent(".greeting");
  expect(greeting).toBe("Hello, World!");

  const timestamp = await page.textContent(".timestamp");
  expect(timestamp).toBeTruthy();

  // Verify the cached list rendered correctly
  const listItems = await page.locator(".cached-list li").allTextContents();
  expect(listItems.slice(0, 3)).toEqual(["Item A", "Item B", "Item C"]);

  const listTimestamp = await page.textContent(".list-timestamp");
  expect(listTimestamp).toBeTruthy();

  // Reload — cached component tree should be served from localStorage
  await page.reload();
  await page.waitForLoadState("networkidle");

  expect(await page.textContent(".greeting")).toBe("Hello, World!");
  expect(await page.textContent(".timestamp")).toBe(timestamp);
  expect(await page.textContent(".list-timestamp")).toBe(listTimestamp);

  // Wait for local cache TTL (3s) to expire, session cache should still hold
  const start = Date.now();
  let currentTimestamp = timestamp;
  while (currentTimestamp === timestamp) {
    await page.reload();
    await page.waitForLoadState("networkidle");
    currentTimestamp = await page.textContent(".timestamp");
  }
  expect(Date.now() - start).toBeGreaterThan(2500);

  // Session-cached list should still be the same
  expect(await page.textContent(".list-timestamp")).toBe(listTimestamp);

  // Wait for session cache TTL (5s) to expire
  let currentListTimestamp = listTimestamp;
  while (currentListTimestamp === listTimestamp) {
    await page.reload();
    await page.waitForLoadState("networkidle");
    currentListTimestamp = await page.textContent(".list-timestamp");
  }
  expect(Date.now() - start).toBeGreaterThan(4500);
});

test("rsc serialization", async () => {
  await server("fixtures/rsc.jsx");
  await page.goto(hostname);
  await page.waitForLoadState("networkidle");
  await waitForHydration();

  expect(await page.textContent("#serialized")).toContain(
    process.env.NODE_ENV === "production"
      ? `1:I["/client/fixtures/counter.`
      : `I["fixtures/counter.jsx",[],"default"`
  );
  expect(await page.getByRole("button").count()).toBe(3);
  expect(
    await page.getByRole("button", { name: "0", exact: true }).textContent()
  ).toBe("0");

  const serverFunction = await page.getByRole("button", {
    name: "Call Server Function",
    exact: true,
  });
  await serverFunction.click();
  await waitForChange(
    () => serverFunction.click(),
    () => serverLogs.length
  );
  expect(serverLogs).toContain(
    "Server Function called from cached component RSC Form Value bar"
  );
});
