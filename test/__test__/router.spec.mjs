import { hostname, page, server } from "playground/utils";
import { expect, test } from "vitest";

test("router", async () => {
  await server("fixtures/router.jsx");
  await page.goto(hostname);
  expect(await page.textContent("body")).toContain("Home");
  await page.goto(hostname + "/first");
  expect(await page.textContent("body")).toContain("First");
  await page.goto(hostname + "/second");
  expect(await page.textContent("body")).toContain("Second");
  await page.goto(hostname + "/third");
  expect(await page.textContent("body")).toContain("Third");
  await page.goto(hostname + "/not-found");
  expect(await page.textContent("body")).toContain("Not Found");
  await page.goto(hostname + "/first/second");
  expect(await page.textContent("body")).toContain("First");
});

test("router action state", async () => {
  await server("fixtures/router-actionstate.jsx");
  await page.goto(hostname);
  const submit = await page.getByRole("button");
  expect(await submit.isVisible()).toBeTruthy();
  await page.fill("input[name=username]", "John Doe");
  await page.click("input[type=submit]");
  expect(await page.textContent("body")).toContain('{"success":true}');
  await page.fill("input[name=username]", "Jane Doe");
  await page.click("input[type=submit]");
  expect(await page.textContent("body")).toContain("Unauthorized");
});

test("router match", async () => {
  await server("fixtures/router-match.jsx");
  await page.goto(hostname + "/users/123");
  expect(await page.textContent("body")).toContain(
    `/users/[userId] {"userId":"123"}`
  );
  await page.goto(hostname + "/users/123/a/b/c");
  expect(await page.textContent("body")).toContain(
    `/users/[userId]/[...slug] {"userId":"123","slug":["a","b","c"]}`
  );
  await page.goto(hostname + "/users/123/a/b/c/edit");
  expect(await page.textContent("body")).toContain(
    `/users/[userId]/[[...slug]]/edit {"userId":"123","slug":["a","b","c"]}`
  );
  await page.goto(hostname + "/users/123/edit");
  expect(await page.textContent("body")).toContain(
    `/users/[userId]/[[...slug]]/edit {"userId":"123","slug":[]}`
  );
  await page.goto(hostname + "/users-ext/USER-123");
  expect(await page.textContent("body")).toContain(
    `/users-ext/USER-[userId] {"userId":"123"}`
  );
  await page.goto(hostname + "/users-ext/MATCHER-123");
  expect(await page.textContent("body")).toContain(
    `/users-ext/MATCHER-[userId=number] {"userId":"123"}`
  );
});
