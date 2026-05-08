import {
  appDir,
  hostname,
  page,
  server,
  waitForHydration,
} from "playground/utils";
import { beforeAll, describe, expect, test } from "vitest";

// The monitor example reads `node:os` for live system metrics and
// drives updates over the live transport's Node-only socket.io path —
// neither survives the edge build target. Skip the whole describe
// under EDGE/EDGE_ENTRY (and put `beforeAll` inside the describe so
// `describe.skipIf` short-circuits the setup too).
const isEdge = !!process.env.EDGE || !!process.env.EDGE_ENTRY;

describe.skipIf(isEdge)("monitor example", () => {
  beforeAll(async () => {
    await server("./src/index.jsx", { cwd: appDir("examples/monitor") });
  });

  test("renders the resource monitor SVG without errors", async () => {
    /** @type {string[]} */
    const consoleErrors = [];
    page.on("pageerror", (err) => consoleErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    // Don't wait for `networkidle` — the live channel (socket.io polling /
    // websocket) keeps a long-lived connection open by design, so the page
    // never actually goes idle. `domcontentloaded` plus the explicit
    // hydration wait below is the right barrier here.
    await page.goto(hostname, { waitUntil: "domcontentloaded" });
    await waitForHydration();

    // Static first yield must be present in the rendered HTML — proves the
    // live component's initial yield was serialized through the RSC stream.
    const heading = page.getByRole("heading", {
      name: "Resource Monitor Example",
      level: 1,
    });
    await heading.waitFor({ state: "visible" });
    expect(await heading.isVisible()).toBe(true);

    // SVG axis labels are part of the static first yield, so they MUST
    // appear without waiting for any live channel updates.
    const bodyText = await page.textContent("body");
    expect(bodyText).toContain("CPU avg:");
    expect(bodyText).toContain("CPU peak:");
    expect(bodyText).toContain("Mem. avg:");
    expect(bodyText).toContain("Mem. peak:");

    expect(consoleErrors).toEqual([]);
  });

  test("live channel pushes updates that change the average values", async () => {
    // The worker yields a fresh frame every ~16ms (after sampling). Read
    // the CPU/Mem average labels, then poll for either to change. The values
    // are floats with 2 decimal places — even a single CPU/mem sample shift
    // will change the rendered text.
    const initial = await readMonitorValues();

    const deadline = Date.now() + 30000;
    let updated = initial;
    while (
      Date.now() < deadline &&
      updated.cpuAvg === initial.cpuAvg &&
      updated.memAvg === initial.memAvg
    ) {
      await page.waitForTimeout(250);
      updated = await readMonitorValues();
    }

    expect(
      updated.cpuAvg !== initial.cpuAvg || updated.memAvg !== initial.memAvg,
      `expected live channel to push at least one update; values stayed at CPU avg=${initial.cpuAvg}, Mem avg=${initial.memAvg}`
    ).toBe(true);
  });
});

/**
 * Pull the four floats out of the monitor SVG's text labels.
 * Returns 0s if the SVG hasn't rendered yet — the caller polls.
 */
async function readMonitorValues() {
  return await page.evaluate(() => {
    const text = document.body.innerText;
    const grab = (re) => {
      const m = text.match(re);
      return m ? parseFloat(m[1]) : 0;
    };
    return {
      cpuAvg: grab(/CPU avg:\s*([\d.]+)%/),
      cpuPeak: grab(/CPU peak:\s*([\d.]+)%/),
      memAvg: grab(/Mem\. avg:\s*([\d.]+)%/),
      memPeak: grab(/Mem\. peak:\s*([\d.]+)%/),
    };
  });
}
