import { join } from "node:path";

import { hostname, page, server, waitForChange } from "playground/utils";
import { beforeAll, describe, expect, it } from "vitest";

process.chdir(join(process.cwd(), "../examples/file-router"));

describe("file-router plugin", () => {
  beforeAll(async () => {
    await server(null);
  });
  it("forms action redirect", async () => {
    await page.goto(`${hostname}/forms`);
    await page.waitForLoadState("networkidle");
    expect(await page.textContent("body")).toContain("Layout (forms)");
    expect(await page.textContent("body")).not.toContain(
      "Layout (forms simple)"
    );

    await page.goto(`${hostname}/forms-simple`);
    await page.waitForLoadState("networkidle");
    expect(await page.textContent("body")).not.toContain("Layout (forms)");
    expect(await page.textContent("body")).toContain("Layout (forms simple)");

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

  it("rsc redirects to 404 page on route not found", async () => {
    await page.goto(`${hostname}/`);
    await page.waitForLoadState("networkidle");
    // Track network responses (the real page load will appear here)
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) => {
          const url = res.url();
          return (
            !url.includes("rsc.x-component") &&
            url.includes("/notexisting") &&
            res.status() === 404
          );
        },
        { timeout: 1500 }
      ),
      page.click("#notexisting"),
    ]);

    expect(response.status()).toBe(404);
    expect(await response.text()).toContain("404 - Page Not Found");
  });

  it("rsc redirects from middleware to 404 page on route not found", async () => {
    await page.goto(`${hostname}/`);
    await page.waitForLoadState("networkidle");
    // Track network responses (the real page load will appear here)
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) => {
          const url = res.url();
          return (
            !url.includes("rsc.x-component") &&
            url.includes("/notexisting") &&
            res.status() === 404
          );
        },
        { timeout: 1500 }
      ),
      page.click("#redirect-notfound"),
    ]);

    expect(response.status()).toBe(404);
    expect(await response.text()).toContain("404 - Page Not Found");
  });

  it("rsc redirects from middleware to external url", async () => {
    await page.goto(`${hostname}/`);
    await page.waitForLoadState("networkidle");
    // Track network responses (the real page load will appear here)
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) => {
          const url = res.url();
          return (
            !url.includes("rsc.x-component") &&
            url.includes("https://react-server.dev") &&
            res.status() === 200
          );
        },
        { timeout: 1500 }
      ),
      page.click("#redirect-external"),
    ]);

    expect(response.status()).toBe(200);
    expect(await response.text()).toContain("react-server");
  });

  it("rsc redirects from middleware to api to external url", async () => {
    await page.goto(`${hostname}/`);
    await page.waitForLoadState("networkidle");
    // Track network responses (the real page load will appear here)
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) => {
          const url = res.url();
          return (
            !url.includes("rsc.x-component") &&
            url.includes("https://react-server.dev") &&
            res.status() === 200
          );
        },
        { timeout: 1500 }
      ),
      page.click("#redirect-api-external"),
    ]);

    expect(response.status()).toBe(200);
    expect(await response.text()).toContain("react-server");
  });

  it("rsc redirects to existing internal route", async () => {
    await page.goto(`${hostname}/`);
    await page.waitForLoadState("networkidle");
    // Track network responses (the real page load will appear here)
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) => {
          const url = res.url();
          return url.includes("/about") && res.status() === 200;
        },
        { timeout: 1500 }
      ),
      page.click("#redirect-exists"),
    ]);

    expect(response.status()).toBe(200);
    expect(await response.text()).toContain("About");
  });
});
