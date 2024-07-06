import { logs, page } from "./vitestSetup.mjs";

export * from "./vitestSetup.mjs";

export function nextAnimationFrame() {
  return page.evaluate(() => new Promise(requestAnimationFrame));
}

export async function waitForChange(action, getValue) {
  const originalValue = await getValue();
  let newValue = originalValue;
  while (newValue === originalValue) {
    await action();
    newValue = await getValue();
    if (newValue !== originalValue) return;
    await nextAnimationFrame();
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
