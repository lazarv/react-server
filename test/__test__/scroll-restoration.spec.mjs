import {
  hostname,
  page,
  server,
  waitForHydration,
  nextAnimationFrame,
} from "playground/utils";
import { expect, test } from "vitest";

const SCROLL_SETTLE_MS = 400;

async function getScrollY() {
  return page.evaluate(() => window.scrollY);
}

async function scrollTo(y) {
  await page.evaluate((y) => window.scrollTo(0, y), y);
  // Wait for scroll to settle and position to be saved
  await page.waitForTimeout(SCROLL_SETTLE_MS);
}

async function waitForScrollY(expectedY, tolerance = 5, timeout = 5000) {
  const deadline = Date.now() + timeout;
  let scrollY;
  while (Date.now() < deadline) {
    scrollY = await getScrollY();
    if (Math.abs(scrollY - expectedY) <= tolerance) return scrollY;
    await nextAnimationFrame();
  }
  return scrollY;
}

async function clickLink(testId) {
  await page.click(`[data-testid="${testId}"]`);
  // Wait for navigation and scroll to settle
  await page.waitForTimeout(SCROLL_SETTLE_MS);
}

async function waitForPageTitle(expected, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const text = await page.textContent('[data-testid="page-title"]');
      if (text === expected) return;
    } catch {
      // Element may not exist yet during navigation
    }
    await nextAnimationFrame();
  }
  throw new Error(
    `waitForPageTitle: expected "${expected}" but timed out after ${timeout}ms`
  );
}

test("scroll restoration: forward navigation scrolls to top", async () => {
  await server("fixtures/scroll-restoration.jsx", {
    scrollRestoration: true,
  });
  await page.goto(hostname);
  await waitForHydration();

  // Scroll down on home page
  await scrollTo(500);
  expect(await getScrollY()).toBeGreaterThan(400);

  // Navigate to Page A — should scroll to top
  await clickLink("nav-page-a");
  await waitForPageTitle("Page A");

  const scrollY = await waitForScrollY(0);
  expect(scrollY).toBeLessThanOrEqual(5);
});

test("scroll restoration: back navigation restores scroll position", async () => {
  await server("fixtures/scroll-restoration.jsx", {
    scrollRestoration: true,
  });
  await page.goto(hostname);
  await waitForHydration();

  // Scroll down on home page
  await scrollTo(800);
  const savedY = await getScrollY();
  expect(savedY).toBeGreaterThan(700);

  // Navigate to Page A
  await clickLink("nav-page-a");
  await waitForPageTitle("Page A");
  await waitForScrollY(0);

  // Go back — should restore to ~800
  await page.goBack();
  await waitForPageTitle("Home");

  const restoredY = await waitForScrollY(savedY, 50);
  expect(restoredY).toBeGreaterThan(700);
});

test("scroll restoration: multiple back/forward preserves positions", async () => {
  await server("fixtures/scroll-restoration.jsx", {
    scrollRestoration: true,
  });
  await page.goto(hostname);
  await waitForHydration();

  // Scroll on home
  await scrollTo(500);
  const homeY = await getScrollY();

  // Navigate to Page A, scroll there
  await clickLink("nav-page-a");
  await waitForPageTitle("Page A");
  await scrollTo(1200);
  const pageAY = await getScrollY();

  // Navigate to Page B
  await clickLink("nav-page-b");
  await waitForPageTitle("Page B");
  await waitForScrollY(0);

  // Go back to Page A — should restore scroll
  await page.goBack();
  await waitForPageTitle("Page A");
  const restoredPageAY = await waitForScrollY(pageAY, 50);
  expect(restoredPageAY).toBeGreaterThan(1100);

  // Go back to Home — should restore scroll
  await page.goBack();
  await waitForPageTitle("Home");
  const restoredHomeY = await waitForScrollY(homeY, 50);
  expect(restoredHomeY).toBeGreaterThan(400);

  // Go forward to Page A — should restore scroll
  await page.goForward();
  await waitForPageTitle("Page A");
  const forwardPageAY = await waitForScrollY(pageAY, 50);
  expect(forwardPageAY).toBeGreaterThan(1100);
});

test("scroll restoration: query-param-only change preserves scroll", async () => {
  await server("fixtures/scroll-restoration.jsx", {
    scrollRestoration: true,
  });
  await page.goto(hostname + "/page-c?filter=1");
  await waitForHydration();

  // Scroll down on Page C
  await scrollTo(600);
  const beforeY = await getScrollY();
  expect(beforeY).toBeGreaterThan(500);

  // Navigate to same page with different query param
  await clickLink("nav-page-c-filter2");
  await page.waitForTimeout(SCROLL_SETTLE_MS);

  // Scroll should NOT jump to top for query-param-only changes
  const afterY = await getScrollY();
  expect(afterY).toBeGreaterThan(500);
});

test("scroll restoration: hash navigation scrolls to anchor", async () => {
  await server("fixtures/scroll-restoration.jsx", {
    scrollRestoration: true,
  });
  await page.goto(hostname);
  await waitForHydration();

  // Navigate to Page D with hash
  await clickLink("nav-page-d-hash");
  await waitForPageTitle("Page D");

  // Should have scrolled to #section-20 (each section is 100px + 20px padding + border)
  // The exact Y depends on layout, but it should be significantly scrolled
  await page.waitForTimeout(SCROLL_SETTLE_MS);
  const scrollY = await getScrollY();
  expect(scrollY).toBeGreaterThan(500);
});

test("scroll restoration: useScrollPosition handler can skip scrolling", async () => {
  await server("fixtures/scroll-restoration.jsx", {
    scrollRestoration: true,
  });
  await page.goto(hostname);
  await waitForHydration();

  // Scroll down on home page
  await scrollTo(700);
  const beforeY = await getScrollY();
  expect(beforeY).toBeGreaterThan(600);

  // Navigate to skip-scroll page — handler returns false, so scroll should not change
  await clickLink("nav-skip-scroll");
  await waitForPageTitle("Skip Scroll Page");
  await page.waitForTimeout(SCROLL_SETTLE_MS);

  const afterY = await getScrollY();
  // The scroll position should remain roughly the same since handler returned false
  expect(afterY).toBeGreaterThan(500);
});

test("scroll restoration: scroll container position is saved and restored", async () => {
  await server("fixtures/scroll-restoration.jsx", {
    scrollRestoration: true,
  });
  await page.goto(hostname + "/page-e");
  await waitForHydration();

  // Scroll the sidebar container
  const container = page.locator('[data-testid="scroll-container"]');
  await container.evaluate((el) => el.scrollTo(0, 400));
  await page.waitForTimeout(SCROLL_SETTLE_MS);

  const savedContainerY = await container.evaluate((el) => el.scrollTop);
  expect(savedContainerY).toBeGreaterThan(350);

  // Navigate away
  await clickLink("nav-page-a");
  await waitForPageTitle("Page A");

  // Go back to Page E
  await page.goBack();
  await waitForPageTitle("Page E");
  await page.waitForTimeout(1000); // Container restore can be deferred

  // Container scroll should be restored
  const restoredContainerY = await container.evaluate((el) => el.scrollTop);
  expect(restoredContainerY).toBeGreaterThan(350);
});

test("scroll restoration: browser history.scrollRestoration is set to manual", async () => {
  await server("fixtures/scroll-restoration.jsx", {
    scrollRestoration: true,
  });
  await page.goto(hostname);
  await waitForHydration();

  const scrollRestoration = await page.evaluate(
    () => history.scrollRestoration
  );
  expect(scrollRestoration).toBe("manual");
});

test("scroll restoration: page refresh restores scroll position", async () => {
  await server("fixtures/scroll-restoration.jsx", {
    scrollRestoration: true,
  });
  await page.goto(hostname);
  await waitForHydration();

  // Scroll down
  await scrollTo(900);
  const savedY = await getScrollY();
  expect(savedY).toBeGreaterThan(800);

  // Wait extra for save to sessionStorage
  await page.waitForTimeout(500);

  // Refresh the page
  await page.reload();
  await waitForHydration();

  // Scroll should be restored
  const restoredY = await waitForScrollY(savedY, 50, 3000);
  expect(restoredY).toBeGreaterThan(800);
});
