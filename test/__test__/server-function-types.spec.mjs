import * as setup from "playground/utils";
import { beforeAll, beforeEach, expect, test } from "vitest";

const { waitForChange, waitForHydration } = setup;

const instanceOf = (type) => async (page) => {
  await page.waitForFunction(
    () => window.__react_server_result__ !== undefined
  );
  expect(
    await page.evaluate(() => window.__react_server_result__.constructor.name)
  ).toBe(type);
};

const typeOf = (type) => async (page) => {
  if (type !== "undefined") {
    await page.waitForFunction(
      () => window.__react_server_result__ !== undefined
    );
  }
  expect(await page.evaluate(() => typeof window.__react_server_result__)).toBe(
    type
  );
};

const validator = {
  "form-data-action": instanceOf("FormData"),
  "array-buffer-action": instanceOf("ArrayBuffer"),
  "buffer-action": instanceOf("ArrayBuffer"),
  "array-buffer-view-action": instanceOf("Uint8Array"),
  "blob-action": instanceOf("Blob"),
  "text-action": typeOf("string"),
  "json-action": instanceOf("Object"),
  "no-content-action": typeOf("undefined"),
  "error-action": instanceOf("Error"),
  "reload-action": async (page) => {
    await page.waitForFunction(() =>
      document.body.innerHTML.includes("timestamp")
    );
    expect(await page.evaluate(() => document.body.innerHTML)).toContain(
      "timestamp"
    );
  },
  "redirect-action": async (page) => {
    await page.waitForFunction(
      () => window.location.pathname === "/some-other-page"
    );
    expect(await page.evaluate(() => window.location.pathname)).toBe(
      "/some-other-page"
    );
  },
  "stream-action": async (page) => {
    await page.waitForFunction(
      () => window.__react_server_result__ !== undefined
    );
    expect(
      await page.evaluate(() => window.__react_server_result__.constructor.name)
    ).toBe("ReadableStream");
    await waitForChange(null, () =>
      setup.logs.find((log) => log.includes("done"))
    );
    expect(setup.logs).toEqual(
      expect.arrayContaining(["hello 0", "hello 1", "hello 2", "done"])
    );
  },
  "iterator-action": async (page) => {
    await page.waitForFunction(
      () => window.__react_server_result__ !== undefined
    );
    expect(
      await page.evaluate(
        () => window.__react_server_result__[Symbol.asyncIterator].name
      )
    ).toBe("asyncIterator");
    await waitForChange(null, () =>
      setup.logs.find((log) => log.includes("done"))
    );
    expect(setup.logs).toEqual(
      expect.arrayContaining(["hello 0", "hello 1", "hello 2", "done"])
    );
  },
};

const types = [
  "form-data-action",
  "array-buffer-action",
  "buffer-action",
  "array-buffer-view-action",
  "blob-action",
  "text-action",
  "json-action",
  "no-content-action",
  "error-action",
  "reload-action",
  "stream-action",
  "iterator-action",
];

// Single server boot for the whole spec — every test targets the same fixture
// and only differs in which button it clicks. The previous per-test boot cost
// ~5s per case × 12 cases ≈ a full minute of pure Vite cold-start overhead.
beforeAll(async () => {
  await setup.server("fixtures/server-function-types.jsx");
});

// Each test gets a fresh navigation + a fresh log buffer. Navigation is needed
// because `redirect-action` leaves the page on `/some-other-page`, and even
// tests that don't navigate need the `window.__react_server_result__` sentinel
// cleared. The log arrays are the ones `server()` assigned during boot — we
// mutate them in place (length = 0) so consumers reading `setup.logs` still
// see the same live reference.
beforeEach(async () => {
  await setup.page.goto(setup.hostname);
  await waitForHydration();
  await setup.page.evaluate(() => {
    window.__react_server_result__ = undefined;
  });
  setup.logs.length = 0;
  setup.serverLogs.length = 0;
});

for (const type of types) {
  test(`server function type ${type}`, async () => {
    const button = setup.page.getByRole("button", { name: type, exact: true });
    await waitForChange(
      () => button.click(),
      () => setup.serverLogs.find((log) => log.includes(type))
    );
    expect(setup.serverLogs.find((log) => log.includes(type))).toBeDefined();
    await validator[type](setup.page);
  });
}
