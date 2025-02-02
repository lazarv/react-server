import {
  hostname,
  logs,
  page,
  server,
  serverLogs,
  waitForChange,
  waitForHydration,
} from "playground/utils";
import { expect, test } from "vitest";

const instanceOf = (type) => async (page) => {
  await page.waitForTimeout(0);
  expect(
    await page.evaluate(() => window.__react_server_result__.constructor.name)
  ).toBe(type);
};

const typeOf = (type) => async (page) => {
  await page.waitForTimeout(0);
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
    await page.waitForTimeout(0);
    expect(await page.evaluate(() => document.body.innerHTML)).toContain(
      "timestamp"
    );
  },
  "stream-action": async (page) => {
    await page.waitForTimeout(0);
    expect(
      await page.evaluate(() => window.__react_server_result__.constructor.name)
    ).toBe("ReadableStream");
    await waitForChange(null, () => logs.find((log) => log.includes("done")));
    expect(logs).toEqual(
      expect.arrayContaining(["hello 0", "hello 1", "hello 2", "done"])
    );
  },
  "iterator-action": async (page) => {
    await page.waitForTimeout(0);
    expect(
      await page.evaluate(
        () => window.__react_server_result__[Symbol.asyncIterator].name
      )
    ).toBe("asyncIterator");
    await waitForChange(null, () => logs.find((log) => log.includes("done")));
    expect(logs).toEqual(
      expect.arrayContaining(["hello 0", "hello 1", "hello 2", "done"])
    );
  },
};

const createTest = (type) =>
  test(`server function type ${type}`, async () => {
    await server("fixtures/server-function-types.jsx");
    await page.goto(hostname);
    await waitForHydration();
    const button = page.getByRole("button", { name: type, exact: true });
    await waitForChange(
      () => button.click(),
      () => serverLogs.find((log) => log.includes(type))
    );
    expect(serverLogs.find((log) => log.includes(type))).toBeDefined();
    await validator[type](page);
  });

[
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
].forEach(createTest);
