import {
  appDir,
  hostname,
  page,
  server,
  waitForHydration,
} from "playground/utils";
import { beforeAll } from "vitest";
import { describe, expect, test } from "vitest";

beforeAll(async () => {
  await server("./App.jsx", { cwd: appDir("examples/use-worker") });
});

describe("use worker", () => {
  test("renders page with header", async () => {
    await page.goto(`${hostname}/`);
    await page.waitForLoadState("networkidle");
    await waitForHydration();

    const bodyText = await page.textContent("body");
    expect(bodyText).toContain('"use worker"');
    expect(bodyText).toContain("Server Worker Thread");
  });

  test("renders worker stats via Suspense", async () => {
    // Reuse the page from the previous navigation to avoid redundant loads
    const bodyText = await page.textContent("body");
    expect(bodyText).toContain("Heap Used");
    expect(bodyText).toContain("Heap Total");
    expect(bodyText).toContain("RSS");
    expect(bodyText).toContain("Process Uptime");
  });

  test("computes prime numbers in worker", async () => {
    const bodyText = await page.textContent("body");
    expect(bodyText).toContain("Primes Found");
    expect(bodyText).toContain("Largest");
    expect(bodyText).toContain("Computed In");
  });

  test("displays worker module import info", async () => {
    const bodyText = await page.textContent("body");
    expect(bodyText).toContain("Module Import");
    // WorkerImport.mjs delegates to WorkerModule.mjs which returns platform info
    expect(bodyText).toMatch(/linux|darwin|win32/);
  });

  test("streams activity data from worker", async () => {
    // Stream entries are rendered by a client component reading a ReadableStream.
    // They may already be fully rendered by the time hydration completes, so
    // instead of waiting for a body change, poll for the expected text directly.
    await page.waitForFunction(
      () =>
        document.body.textContent.includes("Worker thread initialized") &&
        document.body.textContent.includes("Stream complete"),
      { timeout: 30000 }
    );

    const bodyText = await page.textContent("body");
    expect(bodyText).toContain("Worker thread initialized");
    expect(bodyText).toContain("Stream complete");
  });

  // In Edge builds "use worker" functions run in-process; there is no
  // separate worker thread to terminate, so this test only applies to the
  // Node.js worker-threads path.
  test.skipIf(!!process.env.EDGE || !!process.env.EDGE_ENTRY)(
    "terminate worker and page recovers",
    async () => {
      await page.goto(`${hostname}/`);
      await page.waitForLoadState("networkidle");
      await waitForHydration();

      const terminateButton = await page.$(
        'button[type="submit"]:has-text("Terminate Worker")'
      );
      expect(terminateButton).not.toBeNull();

      // The server action calls terminate() then reload("/"), which triggers a
      // full page navigation.  Wait for that navigation to complete.
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle" }),
        terminateButton.click(),
      ]);
      await waitForHydration();

      // Worker stats are rendered via Suspense; after termination a new worker
      // is spawned and the stats take a moment to resolve.
      await page.waitForFunction(
        () => document.body.textContent.includes("Heap Used"),
        { timeout: 30000 }
      );

      const bodyText = await page.textContent("body");
      expect(bodyText).toContain("Server Worker Thread");
      expect(bodyText).toContain("Heap Used");
    }
  );
});
