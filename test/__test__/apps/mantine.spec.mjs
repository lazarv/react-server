import {
  appDir,
  hostname,
  nextAnimationFrame,
  page,
  server,
  test,
  waitForChange,
  waitForHydration,
} from "playground/utils";
import { describe, expect } from "vitest";

// The Mantine example has historically been the slowest build-mode test
// in CI and intermittently times out. Split the work into two attributable
// tests so a failure points cleanly at *which* phase blew its budget —
// the cold production build, or the server-startup handshake.
//
// In dev mode the build phase is a no-op (server() returns immediately
// when called with phase: "build" and NODE_ENV !== "production"), so the
// same spec shape works in both modes.
//
// Wrapped in a leading `describe` so the build/start tests are guaranteed
// to run before the describes below. If the build test fails, expect every
// downstream test to fail with cascading "Invalid URL" errors because
// `hostname` was never set — the first failure at the top of the report
// (BUILD or START) is the one to read; the rest are downstream noise.
const MANTINE = { cwd: appDir("examples/mantine") };

// TODO: re-enable production build test once the rolldown emit_chunk deadlock
// fix lands. Mantine's build triggers a deadlock in rolldown@1.0.0-rc.13 where
// many `use client` modules each emit a chunk from `transform`, the bounded
// (1024) module-loader channel fills, and the JS thread blocks inside a sync
// `emit_chunk` napi binding that is `block_on`-ing a `tx.send().await` — while
// the loader is waiting on TSFN callbacks that can only run on that same
// blocked JS thread. See rolldown issue #7311 and the upstream fix PR that
// makes the entire emit_chunk path synchronous.
//
// Dev mode is unaffected (the build phase is a no-op), so we only skip under
// NODE_ENV=production (the test-build-start suite).
const SKIP_MANTINE = process.env.NODE_ENV === "production";

describe.skipIf(SKIP_MANTINE).sequential("mantine", () => {
  describe.sequential("setup", () => {
    test(
      "build",
      {
        timeout: 120000,
      },
      async () => {
        await server(null, { ...MANTINE, phase: "build", timeout: 120000 });
      }
    );

    test(
      "start server",
      {
        timeout: 180000,
      },
      async () => {
        await server(null, { ...MANTINE, phase: "start", timeout: 120000 });
        await page.goto(hostname, { timeout: 120000 });
        await page.waitForLoadState("networkidle");
        await waitForHydration(60000, page);
        expect(new URL(page.url()).origin).toBe(hostname);
      }
    );
  });

  // ── Home page ──

  describe.concurrent("home page", () => {
    test("renders home page with Mantine UI", async ({ page }) => {
      await page.goto(hostname, { timeout: 60000 });
      await page.waitForLoadState("networkidle");
      await waitForHydration(30000, page);

      expect(await page.textContent("body")).toContain("Mantine UI");
    });

    test("increment button updates count", async ({ page }) => {
      await page.goto(hostname, { timeout: 60000 });
      await page.waitForLoadState("networkidle");
      await waitForHydration(30000, page);

      const button = await page.getByRole("button", { name: "Increment" });
      expect(await button.isVisible()).toBe(true);

      await button.click();
      expect(await page.textContent("body")).toContain("Count: 1");
    });
  });

  // ── Form page ──

  describe.concurrent("form", () => {
    test("shows validation error on empty submit", async ({ page }) => {
      await page.goto(new URL("/form", hostname).href);
      await page.waitForLoadState("networkidle");
      await waitForHydration(30000, page);

      const submit = await page.getByRole("button", { name: "Submit" });
      expect(await submit.isVisible()).toBe(true);

      await submit.click();
      expect(await page.textContent("body")).toContain("Invalid email");
    });
  });

  // ── Dates page ──

  describe.concurrent("dates", () => {
    test("date input formats value", async ({ page }) => {
      await page.goto(new URL("/dates", hostname).href);
      await page.waitForLoadState("networkidle");
      await waitForHydration(30000, page);

      const input = await page.getByPlaceholder("Date input");
      await input.fill("1982/06/15");

      await nextAnimationFrame(page);
      await input.blur();
      await nextAnimationFrame(page);
      expect(await input.getAttribute("value")).toContain("June 15, 1982");
    });

    test("locale select changes date format", async ({ page }) => {
      await page.goto(new URL("/dates", hostname).href);
      await page.waitForLoadState("networkidle");
      await waitForHydration(30000, page);

      const input = await page.getByPlaceholder("Date input");
      await input.fill("1982/06/15");

      await nextAnimationFrame(page);
      await input.blur();
      await nextAnimationFrame(page);

      const localeSelect = await page.locator('input[aria-haspopup="listbox"]');
      await localeSelect.click();

      const germanLocale = await page.getByText("German");
      await germanLocale.click();
      expect(await input.getAttribute("value")).toContain("Juni 15, 1982");
    });
  });

  // ── Charts page ──

  describe.concurrent("charts", () => {
    test("renders chart SVGs", async ({ page }) => {
      await page.goto(new URL("/charts", hostname).href);
      await page.waitForLoadState("networkidle");
      await waitForHydration(30000, page);

      const charts = await page.locator("svg[class='recharts-surface']");
      expect(await charts.count()).toEqual(2);
    });
  });

  // ── Notification system ──

  describe.concurrent("notification system", () => {
    test("shows notification on button click", async ({ page }) => {
      await page.goto(new URL("/notification-system", hostname).href);
      await page.waitForLoadState("networkidle");
      await waitForHydration(30000, page);

      const showNotification = await page.getByRole("button", {
        name: "Show notification",
      });
      await showNotification.click();

      const notification = await page.locator("div[role='alert']");
      expect(await notification.isVisible()).toBe(true);
    });
  });

  // ── Spotlight ──

  describe.concurrent("spotlight", () => {
    test("opens spotlight and searches for items", async ({ page }) => {
      await page.goto(new URL("/spotlight", hostname).href);
      await page.waitForLoadState("networkidle");
      await waitForHydration(30000, page);

      const openSpotlight = await page.getByRole("button", {
        name: "Open spotlight",
      });
      await openSpotlight.click();

      await nextAnimationFrame(page);

      const search = await page.getByPlaceholder("Search...");
      expect(await search.isVisible()).toBe(true);

      await search.fill("Home");
      await nextAnimationFrame(page);
      await search.blur();

      await waitForChange(
        null,
        () => page.getByRole("button", { name: "Home" }).isVisible(),
        false,
        30000,
        page
      );
      const homeItem = await page.getByRole("button", { name: "Home" });
      expect(await homeItem.isVisible()).toBe(true);

      await homeItem.click();
      await waitForChange(null, () => search.isVisible(), true, 30000, page);
      expect(await search.isVisible()).toBe(false);
    });
  });

  // ── Carousel ──

  describe.concurrent("carousel", () => {
    test("navigates carousel slides", async ({ page }) => {
      await page.goto(new URL("/carousel", hostname).href);
      await page.waitForLoadState("networkidle");
      await waitForHydration(30000, page);

      const carouselContainer = await page.locator(
        "div[class*='mantine-Carousel-container']"
      );
      const carouselContainerStyle =
        await carouselContainer.getAttribute("style");

      const right = await page.locator("button[tabindex='0']");
      await right.click();

      await waitForChange(
        null,
        () => carouselContainer.getAttribute("style"),
        "transform: translate3d(0px, 0px, 0px);",
        30000,
        page
      );
      const rightStyle = await carouselContainer.getAttribute("style");
      expect(rightStyle).not.toEqual(carouselContainerStyle);
    });
  });

  // ── Navigation progress ──

  describe.concurrent("navigation progress", () => {
    test("shows progress bar on start", async ({ page }) => {
      await page.goto(new URL("/navigationprogress", hostname).href);
      await page.waitForLoadState("networkidle");
      await waitForHydration(30000, page);

      const startProgress = await page.getByRole("button", { name: "Start" });
      await startProgress.click();

      await waitForChange(
        null,
        () => page.locator("div[role='progressbar']").isVisible(),
        false,
        30000,
        page
      );
      const progressBar = await page.locator("div[role='progressbar']");
      expect(await progressBar.isVisible()).toBe(true);
    });
  });

  // ── Modals manager ──

  describe.concurrent("modals manager", () => {
    test("opens and confirms modal", async ({ page }) => {
      await page.goto(new URL("/modalsmanager", hostname).href);
      await page.waitForLoadState("networkidle");
      await waitForHydration(30000, page);

      const openConfirmModal = await page.getByRole("button", {
        name: "Open confirm modal",
      });
      await openConfirmModal.click();

      await waitForChange(
        null,
        () => page.locator("section[role='dialog']").isVisible(),
        false,
        30000,
        page
      );
      const confirmModal = await page.locator("section[role='dialog']");
      expect(await confirmModal.isVisible()).toBe(true);

      const confirmModalClose = await page.getByRole("button", {
        name: "Confirm",
      });
      await confirmModalClose.click();

      await waitForChange(
        null,
        () => confirmModal.isVisible(),
        true,
        30000,
        page
      );
      expect(await confirmModal.isVisible()).toBe(false);
    });
  });

  // ── Rich text editor ──

  describe.concurrent("rich text editor", () => {
    test("renders rich text editor content", async ({ page }) => {
      await page.goto(new URL("/rte", hostname).href);
      await page.waitForLoadState("networkidle");
      await waitForHydration(30000, page);

      expect(await page.textContent("body")).toContain(
        "Welcome to Mantine rich text editor"
      );
    });
  });
});
