import { expect } from "vitest";

import { logs, page } from "./vitestSetup.mjs";

export * from "./vitestSetup.mjs";

export function nextAnimationFrame() {
  return page.evaluate(() => new Promise(requestAnimationFrame));
}

export async function waitForChange(
  action,
  getValue,
  initialValue,
  timeout = 30000
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
    await nextAnimationFrame();

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

export async function waitForHydration(timeout = 30000) {
  const deadline = Date.now() + timeout;
  let isHydrated = false;
  while (!isHydrated) {
    if (Date.now() > deadline) {
      throw new Error(`waitForHydration timed out after ${timeout}ms`);
    }
    isHydrated = await page.evaluate(
      () => window.__flightHydration__PAGE_ROOT__
    );
    await nextAnimationFrame();
  }
}

export async function waitForBodyUpdate(fn, timeout = 30000) {
  try {
    const deadline = Date.now() + timeout;
    const originalBody = await page.textContent("body");
    await fn?.();
    let newBody = originalBody;
    while (newBody === originalBody) {
      if (Date.now() > deadline) {
        throw new Error(
          `waitForBodyUpdate timed out after ${timeout}ms waiting for body to change`
        );
      }
      await nextAnimationFrame();
      newBody = await page.textContent("body");
    }
  } catch {
    // awaited
  }
}

export async function expectNoErrors() {
  const title = await page.title();
  if (title.toLowerCase().includes("error")) {
    expect.fail("No error should be rendered");
  }
}
