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
    await page.waitForLoadState("load");
    expect(await page.textContent("body")).toContain("Layout (forms)");
    expect(await page.textContent("body")).not.toContain(
      "Layout (forms simple)"
    );
  });

  test("forms-simple", async () => {
    await page.goto(`${hostname}/forms-simple`);
    await page.waitForLoadState("load");
    expect(await page.textContent("body")).not.toContain("Layout (forms)");
    expect(await page.textContent("body")).toContain("Layout (forms simple)");
  });

  test("form submission", async () => {
    await page.goto(`${hostname}/forms`);
    await page.waitForLoadState("load");
    const titleInput = await page.$('input[name="title"]');
    const noteInput = await page.$('textarea[name="note"]');
    await titleInput.fill("Test Title");
    await noteInput.fill("This is a test note.");
    const prevBody = await page.textContent("body");
    await page.click('button[type="submit"]');
    await page.waitForLoadState("load");
    await waitForChange(null, () => page.textContent("body"), prevBody);
    expect(await page.textContent("body")).toContain(
      "Welcome to the File Router Example"
    );
  });

  test("not found route", async () => {
    await page.goto(`${hostname}/`);
    await page.waitForLoadState("load");
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
    await page.waitForLoadState("load");
    expect(await page.textContent("body")).toContain(
      "Welcome to the File Router Example"
    );
    await waitForHydration();
    const linkToExternal = await page.$('a[href="/redirect-external"]');
    await linkToExternal.click();
    const deadline = Date.now() + 30000;
    while (!page.url().includes("react-server.dev")) {
      if (Date.now() > deadline) {
        throw new Error("Timed out waiting for external redirect");
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(page.url()).toBe("https://react-server.dev/");
  });

  test("external redirect via API", async () => {
    await page.goto(`${hostname}/`);
    await page.waitForLoadState("load");
    expect(await page.textContent("body")).toContain(
      "Welcome to the File Router Example"
    );
    await waitForHydration();
    const linkToExternalWithAPI = await page.$(
      'a[href="/redirect-api-external"]'
    );
    await linkToExternalWithAPI.click();
    const deadline = Date.now() + 30000;
    while (!page.url().includes("react-server.dev")) {
      if (Date.now() > deadline) {
        throw new Error("Timed out waiting for external redirect via API");
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(page.url()).toBe("https://react-server.dev/");
  });

  test("internal redirect", async () => {
    await page.goto(`${hostname}/`);
    await page.waitForLoadState("load");
    expect(await page.textContent("body")).toContain(
      "Welcome to the File Router Example"
    );
    await waitForHydration();
    const linkToRedirectAbout = await page.$('a[href="/redirect-about"]');
    await waitForBodyUpdate(async () => {
      await linkToRedirectAbout.click();
    });
    await page.waitForLoadState("load");
    expect(page.url()).toBe(`${hostname}/about`);
  });

  test("internal redirect to not found", async () => {
    await page.goto(`${hostname}/`);
    await page.waitForLoadState("load");
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
    await page.waitForLoadState("load");
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

  test("redirect kind: navigate (server action)", async () => {
    await page.goto(`${hostname}/redirect-kind`);
    await page.waitForLoadState("load");
    expect(await page.textContent("body")).toContain("Redirect Kind");
    await waitForHydration();
    const btn = await page.$('[data-testid="redirect-navigate"]');
    await waitForBodyUpdate(async () => {
      await btn.click();
    });
    expect(page.url()).toBe(`${hostname}/about`);
    expect(await page.textContent("body")).toContain("About");
  });

  test("redirect kind: push (server action)", async () => {
    await page.goto(`${hostname}/redirect-kind`);
    await page.waitForLoadState("load");
    expect(await page.textContent("body")).toContain("Redirect Kind");
    await waitForHydration();
    const btn = await page.$('[data-testid="redirect-push"]');
    await waitForBodyUpdate(async () => {
      await btn.click();
    });
    expect(page.url()).toBe(`${hostname}/about`);
    expect(await page.textContent("body")).toContain("About");
    // push kind adds a history entry, going back should return to redirect-kind page
    const prevUrl = page.url();
    await page.goBack();
    await waitForChange(null, () => page.url(), prevUrl);
    expect(page.url()).toBe(`${hostname}/redirect-kind`);
    await waitForBodyUpdate();
    expect(await page.textContent("body")).toContain("Redirect Kind");
  });

  test("redirect kind: location (server action, same-origin)", async () => {
    await page.goto(`${hostname}/redirect-kind`);
    await page.waitForLoadState("load");
    expect(await page.textContent("body")).toContain("Redirect Kind");
    await waitForHydration();
    const btn = await page.$('[data-testid="redirect-location"]');
    await btn.click();
    // location kind forces a full browser navigation via location.href
    await page.waitForURL(`${hostname}/about`);
    await page.waitForLoadState("load");
    expect(page.url()).toBe(`${hostname}/about`);
    expect(await page.textContent("body")).toContain("About");
  });

  test("redirect kind: location (server action, external)", async () => {
    await page.goto(`${hostname}/redirect-kind`);
    await page.waitForLoadState("load");
    expect(await page.textContent("body")).toContain("Redirect Kind");
    await waitForHydration();
    const btn = await page.$('[data-testid="redirect-location-external"]');
    await btn.click();
    const deadline = Date.now() + 30000;
    while (!page.url().includes("react-server.dev")) {
      if (Date.now() > deadline) {
        throw new Error(
          "Timed out waiting for external redirect via location kind"
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(page.url()).toBe("https://react-server.dev/");
  });

  test("redirect kind: error (server action, try/catch)", async () => {
    await page.goto(`${hostname}/redirect-kind`);
    await page.waitForLoadState("load");
    expect(await page.textContent("body")).toContain("Redirect Kind");
    await waitForHydration();
    const btn = await page.$('[data-testid="redirect-error"]');
    await waitForBodyUpdate(async () => {
      await btn.click();
    });
    // error kind should NOT navigate away — client catches the error
    expect(page.url()).toBe(`${hostname}/redirect-kind`);
    const resultEl = await page.$('[data-testid="redirect-error-result"]');
    expect(resultEl).not.toBeNull();
    const resultText = await resultEl.textContent();
    expect(resultText).toContain("Caught redirect to: /about");
  });

  test("redirect kind: push (middleware)", async () => {
    await page.goto(`${hostname}/`);
    await page.waitForLoadState("load");
    expect(await page.textContent("body")).toContain(
      "Welcome to the File Router Example"
    );
    await waitForHydration();
    const linkToPush = await page.$('a[href="/redirect-push"]');
    await waitForBodyUpdate(async () => {
      await linkToPush.click();
    });
    await page.waitForLoadState("load");
    expect(page.url()).toBe(`${hostname}/about`);
    expect(await page.textContent("body")).toContain("About");
  });

  test("redirect kind: location (middleware, same-origin)", async () => {
    await page.goto(`${hostname}/`);
    await page.waitForLoadState("load");
    expect(await page.textContent("body")).toContain(
      "Welcome to the File Router Example"
    );
    await waitForHydration();
    const linkToLocation = await page.$('a[href="/redirect-location"]');
    await linkToLocation.click();
    // location kind forces a full browser navigation via location.href
    await page.waitForURL(`${hostname}/about`);
    await page.waitForLoadState("load");
    expect(page.url()).toBe(`${hostname}/about`);
    expect(await page.textContent("body")).toContain("About");
  });

  test("redirect kind: location (middleware, external)", async () => {
    await page.goto(`${hostname}/`);
    await page.waitForLoadState("load");
    expect(await page.textContent("body")).toContain(
      "Welcome to the File Router Example"
    );
    await waitForHydration();
    const linkToLocationExternal = await page.$(
      'a[href="/redirect-location-external"]'
    );
    await linkToLocationExternal.click();
    const deadline = Date.now() + 30000;
    while (!page.url().includes("react-server.dev")) {
      if (Date.now() > deadline) {
        throw new Error(
          "Timed out waiting for external redirect via location kind"
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(page.url()).toBe("https://react-server.dev/");
  });

  test("redirect kind: error (middleware)", async () => {
    // For middleware redirects, the "error" kind behaves the same as "navigate"
    // because the redirect is handled at the server level before reaching the client.
    // The "error" kind is only meaningful for server actions (try/catch on client).
    await page.goto(`${hostname}/redirect-error`);
    await page.waitForLoadState("load");
    expect(page.url()).toBe(`${hostname}/about`);
    expect(await page.textContent("body")).toContain("About");
  });
});
