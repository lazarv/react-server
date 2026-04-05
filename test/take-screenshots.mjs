/**
 * Playwright script to capture DevTools screenshots for docs.
 *
 * Prerequisites:
 *   1. Start the docs dev server with DevTools enabled:
 *        cd docs && pnpm dev --devtools
 *   2. Run this script:
 *        node test/take-screenshots.mjs [port] [screenshot-name]
 *
 * Each screenshot is saved in both light and dark variants as WebP
 * into docs/public/. Uses cwebp for PNG→WebP conversion.
 */

import { chromium } from "playwright-chromium";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, "..", "docs", "public");

const PORT = parseInt(process.argv[2] || "3000", 10);
const BASE = `http://localhost:${PORT}`;

// Viewport sized for docs screenshots — wide enough to show devtools comfortably
const VIEWPORT = { width: 1280, height: 800 };

// DevTools localStorage key and desired state
const DEVTOOLS_KEY = "__react_server_devtools__";
const DEVTOOLS_SESSION_KEY = "__react_server_devtools_session__";

/**
 * Save a Playwright PNG buffer as WebP using cwebp.
 * Quality 90 gives near-lossless results at ~30-40% of PNG size.
 */
function saveAsWebP(pngBuffer, outputPath) {
  const tmpPng = join(tmpdir(), `screenshot-${Date.now()}.png`);
  try {
    writeFileSync(tmpPng, pngBuffer);
    execFileSync("cwebp", ["-q", "90", "-m", "6", tmpPng, "-o", outputPath], {
      stdio: "pipe",
    });
  } finally {
    try {
      unlinkSync(tmpPng);
    } catch {}
  }
}

/**
 * Set the devtools state via localStorage + sessionStorage, then reload.
 */
async function setDevToolsState(
  page,
  {
    open = true,
    dockMode = "bottom",
    panelHeight = 350,
    panelWidth = 450,
    activeTab = "status",
    floatRect = null,
  }
) {
  await page.evaluate(
    ({ key, sessionKey, state, session }) => {
      localStorage.setItem(key, JSON.stringify(state));
      sessionStorage.setItem(sessionKey, JSON.stringify(session));
    },
    {
      key: DEVTOOLS_KEY,
      sessionKey: DEVTOOLS_SESSION_KEY,
      state: {
        open,
        dockMode,
        panelHeight,
        panelWidth,
        floatRect: floatRect ?? { x: 200, y: 120, width: 820, height: 480 },
      },
      session: { activeTab },
    }
  );
}

/**
 * Wait for the devtools panel iframe to be loaded and rendered.
 */
async function waitForDevTools(page) {
  // Wait for the iframe element to appear
  await page.waitForSelector('iframe[src*="__react_server_devtools__"]', {
    timeout: 10000,
  });
  // Give the iframe content time to hydrate and receive data via Socket.IO
  await page.waitForTimeout(3000);
}

/**
 * Set theme on the host page and notify the devtools iframe.
 */
async function setDarkMode(page, dark) {
  await page.evaluate((isDark) => {
    if (isDark) {
      document.documentElement.classList.remove("light");
      document.documentElement.classList.add("dark");
      document.cookie = "dark=1;path=/";
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
      document.cookie = "dark=0;path=/";
    }
  }, dark);
  // Notify the devtools iframe about the theme change
  await page.evaluate((isDark) => {
    const iframe = document.querySelector(
      'iframe[src*="__react_server_devtools__"]'
    );
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(
        { type: "devtools:theme", dark: isDark },
        "*"
      );
    }
  }, dark);
  // Wait for theme transition to settle
  await page.waitForTimeout(800);
}

/**
 * Take a screenshot in both light and dark mode, saving as WebP.
 * If `panelOnly` is true, screenshots only the devtools panel element.
 */
async function screenshotBothThemes(
  page,
  baseName,
  { panelOnly = false } = {}
) {
  const shotOpts = { type: "png" };

  // If panelOnly, find the devtools panel element (the fixed-position ancestor of the iframe)
  let target = page;
  if (panelOnly) {
    // The panel is the outermost fixed-position div containing the devtools iframe.
    // We locate it by going up from the iframe.
    target = page
      .locator('iframe[src*="__react_server_devtools__"]')
      .locator("xpath=ancestor::div[@style]")
      .last();
  }

  // Light mode
  await setDarkMode(page, false);
  const lightBuf = await target.screenshot(shotOpts);
  saveAsWebP(lightBuf, join(PUBLIC, `${baseName}-light.webp`));
  console.log(`  ✓ ${baseName}-light.webp`);

  // Dark mode
  await setDarkMode(page, true);
  const darkBuf = await target.screenshot(shotOpts);
  saveAsWebP(darkBuf, join(PUBLIC, `${baseName}-dark.webp`));
  console.log(`  ✓ ${baseName}-dark.webp`);
}

/**
 * Navigate to a URL and set up devtools with a specific tab.
 */
async function setupPage(
  page,
  url,
  {
    dockMode = "bottom",
    panelHeight = 350,
    panelWidth = 450,
    activeTab = "status",
    floatRect = null,
  } = {}
) {
  // Navigate first so we have a page context for localStorage
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(1000);

  // Set devtools state and reload so it opens with the right tab
  await setDevToolsState(page, {
    open: true,
    dockMode,
    panelHeight,
    panelWidth,
    activeTab,
    floatRect,
  });
  await page.reload({ waitUntil: "load" });
  await waitForDevTools(page);
}

// ─── Screenshot definitions ──────────────────────────────────────────────────

// Panel-only float rect: positioned at origin, sized to fill nicely
const PANEL_FLOAT = { x: 0, y: 0, width: 960, height: 540 };

const SCREENSHOTS = {
  "devtools-overview": {
    url: "/",
    description: "Overview — Status tab, bottom dock, docs landing page",
    dockMode: "bottom",
    panelHeight: 340,
    activeTab: "status",
  },
  "devtools-float-mode": {
    url: "/",
    description: "Float mode — floating window, draggable/resizable",
    dockMode: "float",
    activeTab: "status",
  },
  "devtools-status": {
    url: "/",
    description: "Status tab — process, CPU, memory gauges",
    dockMode: "float",
    floatRect: PANEL_FLOAT,
    activeTab: "status",
    panelOnly: true,
  },
  "devtools-payload": {
    url: "/",
    description: "Payload tab — RSC flight payload inspection",
    dockMode: "float",
    floatRect: PANEL_FLOAT,
    activeTab: "payload",
    panelOnly: true,
  },
  "devtools-cache": {
    url: "/",
    description: "Cache tab — use cache hit/miss events (pokemon example)",
    dockMode: "float",
    floatRect: PANEL_FLOAT,
    activeTab: "cache",
    panelOnly: true,
  },
  "devtools-routes": {
    url: "/",
    description: "Routes tab — full route tree from docs file-router",
    dockMode: "float",
    floatRect: PANEL_FLOAT,
    activeTab: "routes",
    panelOnly: true,
  },
  "devtools-outlets": {
    url: "/features/devtools",
    description: "Outlets tab — named outlets from docs layout",
    dockMode: "float",
    floatRect: PANEL_FLOAT,
    activeTab: "outlets",
    panelOnly: true,
  },
  "devtools-remotes": {
    url: "/",
    description: "Remotes tab — remote components (remote example)",
    dockMode: "float",
    floatRect: PANEL_FLOAT,
    activeTab: "remotes",
    panelOnly: true,
  },
  "devtools-live": {
    url: "/",
    description: "Live tab — use live streaming components (remote example)",
    dockMode: "float",
    floatRect: PANEL_FLOAT,
    activeTab: "live",
    panelOnly: true,
  },
  "devtools-workers": {
    url: "/",
    description: "Workers tab — use worker threads (use-worker example)",
    dockMode: "float",
    floatRect: PANEL_FLOAT,
    activeTab: "workers",
    panelOnly: true,
  },
  "devtools-highlighting": {
    url: "/features/devtools",
    description: "Element highlighting — outlet overlay on the docs sidebar",
    dockMode: "bottom",
    panelHeight: 340,
    activeTab: "outlets",
    // After devtools is set up, trigger the highlight overlay on @sidebar
    async afterSetup(page) {
      // Send a postMessage to the host page to trigger the highlight overlay
      await page.evaluate(() => {
        window.postMessage(
          {
            type: "devtools:highlight",
            selector: '[data-devtools-outlet="sidebar"]',
            color: "rgba(99, 102, 241, 0.3)",
            label: "@sidebar",
          },
          "*"
        );
      });
      await page.waitForTimeout(800);
    },
  },
  "devtools-logs": {
    url: "/",
    description: "Logs tab — server stdout/stderr output capture",
    dockMode: "float",
    floatRect: PANEL_FLOAT,
    activeTab: "logs",
    panelOnly: true,
    // Generate some page navigations so the Logs tab has visible content.
    // Logs only appear for requests made while the devtools Socket.IO
    // connection is active — so we navigate *after* devtools is open.
    async afterSetup(page, base) {
      // Navigate away and back a few times to generate request logs
      await page.goto(`${base}/`, { waitUntil: "load" });
      await page.waitForTimeout(500);
      await page.goto(`${base}/`, { waitUntil: "load" });
      await page.waitForTimeout(500);
      await page.goto(`${base}/`, { waitUntil: "load" });
      await page.waitForTimeout(500);
      // Now set devtools back to logs tab and wait for it to render
      await setDevToolsState(page, {
        open: true,
        dockMode: "float",
        floatRect: PANEL_FLOAT,
        activeTab: "logs",
      });
      await page.reload({ waitUntil: "load" });
      await waitForDevTools(page);
      // The LogsPanel uses virtual scrolling. On initial mount the
      // container clientHeight may be 0, so getVisibleRange returns an
      // empty range and no rows render. Toggling a filter button forces
      // a React state change → re-render, which recalculates the range
      // with the now-correct container dimensions.
      const dtFrame = page.frameLocator(
        'iframe[src*="__react_server_devtools__"]'
      );
      // Click "stdout" filter, wait, click "All" to force re-render
      await dtFrame.locator(".dt-filter-btn", { hasText: "stdout" }).click();
      await page.waitForTimeout(300);
      await dtFrame.locator(".dt-filter-btn", { hasText: "All" }).click();
      await page.waitForTimeout(500);
    },
  },
};

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const target = process.argv[3] || "all";

  console.log(`\n📸 DevTools screenshot capture`);
  console.log(`   Server: ${BASE}`);
  console.log(`   Output: ${PUBLIC}/\n`);

  // Verify cwebp is available
  try {
    execFileSync("cwebp", ["-version"], { stdio: "pipe" });
  } catch {
    console.error("❌ cwebp not found. Install it: brew install webp\n");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2, // Retina-quality screenshots
  });

  try {
    const page = await context.newPage();

    // Check server is running
    try {
      await page.goto(BASE, { timeout: 5000 });
    } catch {
      console.error(
        `❌ Cannot connect to ${BASE}.\n` +
          `   Start the docs dev server first:\n` +
          `   cd docs && pnpm dev --devtools\n`
      );
      process.exit(1);
    }

    for (const [name, config] of Object.entries(SCREENSHOTS)) {
      if (target !== "all" && target !== name) continue;

      console.log(`📷 ${name}: ${config.description}`);
      await setupPage(page, `${BASE}${config.url}`, {
        dockMode: config.dockMode || "bottom",
        panelHeight: config.panelHeight || 340,
        panelWidth: config.panelWidth || 450,
        activeTab: config.activeTab || "status",
        floatRect: config.floatRect || null,
      });
      if (config.afterSetup) {
        await config.afterSetup(page, BASE);
      }
      await screenshotBothThemes(page, name, {
        panelOnly: config.panelOnly || false,
      });
      console.log();
    }

    console.log("✅ Done!\n");
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
