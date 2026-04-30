import { appDir, hostname, page, server } from "playground/utils";
import { describe, expect, test } from "vitest";

// This spec only runs under `pnpm test-build-start` — the static
// exporter is a build-time pipeline; in dev mode there is nothing to
// exercise. The fixture directory under `test/fixtures/static-export-many`
// owns its own `react-server.config.mjs` whose `export` is an
// async-generator function — the path source the streaming exporter
// is built around. We don't go through `initialConfig` here on
// purpose: a generator function can't survive JSON, and the array
// form blows past env-var size limits at very high N. The on-disk
// config lets us declare the path source once, lazily, and crank the
// count via env without touching the harness.
const isProduction = process.env.NODE_ENV === "production";

// "Many" is a knob — the goal is to push enough paths through the
// streaming pipeline that an O(N²) regression (accidental
// materialization, broken backpressure, growing internal queue) shows
// up either as a wall-clock blow-up that trips the test timeout or as
// a process-level OOM. Default 1000 finishes well under a minute on a
// developer laptop; CI is given a generous timeout below. Override with
// the env var if you're stress-testing the pipeline manually — the
// fixture's `react-server.config.mjs` reads the same env so the
// generator yields the same count the spec expects.
const PATH_COUNT = Number(process.env.STATIC_EXPORT_MANY_COUNT ?? 1000);

describe.skipIf(!isProduction)("static export at scale", () => {
  test("exports many paths declared via async-generator configRoot.export and serves them as static files", async () => {
    await server("./entry.jsx", {
      cwd: appDir("test/fixtures/static-export-many"),
      // The harness defaults `options.export` to false; the build
      // action's gate (`options.export !== false`) would otherwise
      // skip static export entirely, even with the on-disk config
      // present. Passing `{ export: true }` flips the harness flag.
      // The actual path source is the async generator declared in
      // the fixture's react-server.config.mjs — that function can't
      // cross the JSON boundary into the build-worker fork.
      initialConfig: { export: true },
      // Build + render of N paths is the slowest thing this suite
      // does. Give CI a generous ceiling; locally it finishes in a
      // fraction of this.
      timeout: 240_000,
    });

    // Spot-check across the range: first, second, middle, last. If
    // any of these miss the dist tree, the streaming exporter dropped
    // paths somewhere between buildPathStream and the on-disk write.
    // Fetching via HTTP rather than reading the dist directly is
    // deliberate — the production server's static handler is the
    // user-observable consumer of the export output, so testing the
    // round-trip catches both producer and serve-side regressions.
    const samples = [0, 1, Math.floor(PATH_COUNT / 2), PATH_COUNT - 1];
    for (const i of samples) {
      const path = `/p/${i}`;
      await page.goto(hostname + path);
      const text = await page.textContent("#page");
      expect(text).toBe(`Static ${path}`);
    }
  }, 240_000);
});
