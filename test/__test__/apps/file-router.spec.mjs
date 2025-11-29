import { join } from "node:path";

import {
  hostname,
  page,
  server,
  waitForBodyUpdate,
  waitForChange,
  waitForHydration,
} from "playground/utils";
import { beforeAll } from "vitest";
import { describe, expect, test } from "vitest";

process.chdir(join(process.cwd(), "../examples/file-router"));

beforeAll(async () => {
  await server(null);
  await page.route("https://react-server.dev/**", (route) => {
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<html><body><h1>React Server</h1><p>Welcome to the React Server website.</p></body></html>`,
    });
  });
});

describe("file-router plugin", () => {
  test("forms", async () => {
    await page.goto(`${hostname}/forms`);
    await page.waitForLoadState("networkidle");
    expect(await page.textContent("body")).toContain("Layout (forms)");
    expect(await page.textContent("body")).not.toContain(
      "Layout (forms simple)"
    );
  });

  test("forms-simple", async () => {
    await page.goto(`${hostname}/forms-simple`);
    await page.waitForLoadState("networkidle");
    expect(await page.textContent("body")).not.toContain("Layout (forms)");
    expect(await page.textContent("body")).toContain("Layout (forms simple)");
  });

  test("form submission", async () => {
    await page.goto(`${hostname}/forms`);
    await page.waitForLoadState("networkidle");
    const titleInput = await page.$('input[name="title"]');
    const noteInput = await page.$('textarea[name="note"]');
    await titleInput.fill("Test Title");
    await noteInput.fill("This is a test note.");
    const prevBody = await page.textContent("body");
    await page.click('button[type="submit"]');
    await page.waitForLoadState("networkidle");
    await waitForChange(null, () => page.textContent("body"), prevBody);
    expect(await page.textContent("body")).toContain(
      "Welcome to the File Router Example"
    );
  });

  test("not found route", async () => {
    await page.goto(`${hostname}/`);
    await page.waitForLoadState("networkidle");
    expect(await page.textContent("body")).toContain(
      "Welcome to the File Router Example"
    );
    await waitForHydration();
    const linkToNotFound = await page.$('a[href="/notexisting"]');
    await waitForBodyUpdate(async () => {
      await linkToNotFound.click();
    });
    expect(page.url()).toBe(`${hostname}/notexisting`);
    if (process.env.NODE_ENV !== "production") {
      expect(await page.textContent("body")).toContain("Page not found");
    } else {
      expect(await page.textContent("body")).toContain(
        "An error occurred in the Server Components render."
      );
    }
    const prevUrl = await page.url();
    await page.goBack();
    await waitForChange(null, () => page.url(), prevUrl);
    expect(page.url()).toBe(`${hostname}/`);
    await waitForBodyUpdate();
    expect(await page.textContent("body")).toContain(
      "Welcome to the File Router Example"
    );
  });

  test("external redirect", async () => {
    await page.goto(`${hostname}/`);
    await page.waitForLoadState("networkidle");
    expect(await page.textContent("body")).toContain(
      "Welcome to the File Router Example"
    );
    await waitForHydration();
    const linkToExternal = await page.$('a[href="/redirect-external"]');
    await waitForBodyUpdate(async () => {
      await linkToExternal.click();
    });
    await page.waitForLoadState("networkidle");
    expect(page.url()).toBe("https://react-server.dev/");
  });

  test("external redirect via API", async () => {
    await page.goto(`${hostname}/`);
    await page.waitForLoadState("networkidle");
    expect(await page.textContent("body")).toContain(
      "Welcome to the File Router Example"
    );
    await waitForHydration();
    const linkToExternalWithAPI = await page.$(
      'a[href="/redirect-api-external"]'
    );
    await waitForBodyUpdate(async () => {
      await linkToExternalWithAPI.click();
    });
    await page.waitForNavigation();
    expect(page.url()).toBe("https://react-server.dev/");
  });

  test("internal redirect", async () => {
    await page.goto(`${hostname}/`);
    await page.waitForLoadState("networkidle");
    expect(await page.textContent("body")).toContain(
      "Welcome to the File Router Example"
    );
    await waitForHydration();
    const linkToRedirectAbout = await page.$('a[href="/redirect-about"]');
    await waitForBodyUpdate(async () => {
      await linkToRedirectAbout.click();
    });
    await page.waitForLoadState("networkidle");
    expect(page.url()).toBe(`${hostname}/about`);
  });

  test("internal redirect to not found", async () => {
    await page.goto(`${hostname}/`);
    await page.waitForLoadState("networkidle");
    expect(await page.textContent("body")).toContain(
      "Welcome to the File Router Example"
    );
    await waitForHydration();
    const linkToRedirectNotFound = await page.$('a[href="/redirect-notfound"]');
    await waitForBodyUpdate(async () => {
      await linkToRedirectNotFound.click();
    });
    expect(page.url()).toBe(`${hostname}/notexisting`);
    if (process.env.NODE_ENV !== "production") {
      expect(await page.textContent("body")).toContain("Page not found");
    } else {
      expect(await page.textContent("body")).toContain(
        "An error occurred in the Server Components render."
      );
    }
    const prevUrlRedirect = await page.url();
    await waitForBodyUpdate(async () => {
      await page.goBack();
      await waitForChange(null, () => page.url(), prevUrlRedirect);
    });
    expect(page.url()).toBe(`${hostname}/`);
    expect(await page.textContent("body")).toContain(
      "Welcome to the File Router Example"
    );
  });

  test("middleware error handling", async () => {
    await page.goto(`${hostname}/`);
    await page.waitForLoadState("networkidle");
    expect(await page.textContent("body")).toContain(
      "Welcome to the File Router Example"
    );
    await waitForHydration();
    const linkToMiddlewareError = await page.$('a[href="/middleware-error"]');
    await waitForBodyUpdate(async () => {
      await linkToMiddlewareError.click();
    });
    expect(page.url()).toBe(`${hostname}/middleware-error`);
    if (process.env.NODE_ENV !== "production") {
      expect(await page.textContent("body")).toContain(
        "Error thrown in middleware"
      );
    } else {
      expect(await page.textContent("body")).toContain(
        "An error occurred in the Server Components render."
      );
    }
  });
});
