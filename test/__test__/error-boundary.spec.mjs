import { hostname, page, server } from "playground/utils";
import { expect, test } from "vitest";

test("error boundary", async () => {
  await server("fixtures/error-boundary.jsx");
  await page.goto(hostname + "/error-boundary");
  const message = await page.getByTestId("error-message");
  expect(await message.textContent()).toContain("Uh oh, something went wrong!");
  if (process.env.NODE_ENV !== "production") {
    const stack = await page.getByTestId("error-stack");
    expect(await stack.textContent()).toContain("Error: test");
    expect(await stack.textContent()).toContain("at ThrowError");
  }
});

test("throw error", async () => {
  await server("fixtures/error-boundary.jsx");
  await page.goto(hostname + "/throw-error");
  if (process.env.NODE_ENV === "production") {
    expect(await page.textContent("body")).toContain("test");
  } else {
    expect(await page.textContent("body")).toContain("at ThrowError");
  }
});
