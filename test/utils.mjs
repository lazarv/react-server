import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test as baseTest } from "vitest";

import { browser, logs, page } from "./vitestSetup.mjs";

export * from "./vitestSetup.mjs";

/**
 * Vitest `test` extended with a per-test Playwright `page` fixture.
 *
 * Use this as a drop-in replacement for `import { test } from "vitest"`
 * when you need to run tests inside a `describe.concurrent(...)` block.
 * Concurrent tests cannot share the module-level `page` exported from
 * vitestSetup — they would race on URL, viewport and DOM state. The
 * fixture creates a fresh page from the shared browser per concurrent
 * test and closes it on teardown.
 *
 * Tests that don't destructure `page` from the test argument get the
 * existing behaviour (the module-level `page` is unaffected), so the
 * extended `test` is safe to import everywhere — opt-in per test.
 *
 * @example
 * ```js
 * import { test } from "playground/utils";
 *
 * describe.concurrent("page tests", () => {
 *   test("renders", async ({ page }) => {
 *     await page.goto(hostname);
 *     // page is isolated to this test
 *   });
 * });
 * ```
 */
export const test = baseTest.extend({
  // eslint-disable-next-line no-empty-pattern
  page: async ({}, use) => {
    const isolatedPage = await browser.newPage();
    isolatedPage.on("console", (msg) => {
      logs.push(msg.text());
    });
    try {
      await use(isolatedPage);
    } finally {
      try {
        await isolatedPage.close();
      } catch {
        // page may already be closed if the test crashed it
      }
    }
  },
});

const __testDir = resolve(fileURLToPath(import.meta.url), "..");

/**
 * Resolve a path relative to the repo root for use as `cwd` in server().
 * e.g. appDir("examples/file-router") or appDir("docs")
 */
export function appDir(relPath) {
  return join(__testDir, "..", relPath);
}

export function nextAnimationFrame(targetPage = page) {
  return targetPage.evaluate(() => new Promise(requestAnimationFrame));
}

export async function waitForChange(
  action,
  getValue,
  initialValue,
  timeout = 30000,
  targetPage = page
) {
  const deadline = Date.now() + timeout;
  const originalValue = await getValue();
  if (typeof initialValue !== "undefined" && initialValue !== originalValue) {
    return originalValue;
  }
  let newValue = originalValue;
  while (newValue === originalValue) {
    if (Date.now() > deadline) {
      throw new Error(
        `waitForChange timed out after ${timeout}ms waiting for value to change`
      );
    }
    await action?.();
    newValue = await getValue();
    if (newValue !== originalValue) return;
    await nextAnimationFrame(targetPage);

    if (typeof initialValue !== "undefined" && initialValue !== originalValue) {
      return newValue;
    }
  }
  return newValue;
}

export async function waitForConsole(evaluator) {
  const originalLogLength = logs.length;
  let result = await evaluator();
  while (!result) {
    while (logs.length === originalLogLength) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    result = await evaluator();
  }
  return result;
}

export async function waitForHydration(timeout = 30000, targetPage = page) {
  const deadline = Date.now() + timeout;
  let isHydrated = false;
  while (!isHydrated) {
    if (Date.now() > deadline) {
      throw new Error(`waitForHydration timed out after ${timeout}ms`);
    }
    isHydrated = await targetPage.evaluate(
      () => window.__flightHydration__PAGE_ROOT__
    );
    await nextAnimationFrame(targetPage);
  }
}

export async function waitForBodyUpdate(
  fn,
  timeout = 30000,
  targetPage = page
) {
  try {
    const deadline = Date.now() + timeout;
    const originalBody = await targetPage.textContent("body");
    await fn?.();
    let newBody = originalBody;
    while (newBody === originalBody) {
      if (Date.now() > deadline) {
        throw new Error(
          `waitForBodyUpdate timed out after ${timeout}ms waiting for body to change`
        );
      }
      await nextAnimationFrame(targetPage);
      newBody = await targetPage.textContent("body");
    }
  } catch {
    // awaited
  }
}

export async function expectNoErrors(targetPage = page) {
  const title = await targetPage.title();
  if (title.toLowerCase().includes("error")) {
    expect.fail("No error should be rendered");
  }
}
