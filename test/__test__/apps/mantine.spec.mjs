import { join } from "node:path";

import {
  hostname,
  nextAnimationFrame,
  page,
  server,
  waitForHydration,
} from "playground/utils";
import { expect, test } from "vitest";

process.chdir(join(process.cwd(), "../examples/mantine"));

test(
  "mantine and extensions",
  async () => {
    await server(null);
    await page.goto(hostname, { timeout: 60000 });

    await page.waitForLoadState("networkidle");
    await waitForHydration();

    expect(await page.textContent("body")).toContain("Mantine UI");

    const button = await page.getByRole("button", { name: "Increment" });
    expect(await button.isVisible()).toBe(true);

    await button.click();
    expect(await page.textContent("body")).toContain("Count: 1");

    await page.goto(new URL("/form", hostname).href);
    await page.waitForLoadState("networkidle");
    await waitForHydration();

    const submit = await page.getByRole("button", { name: "Submit" });
    expect(await submit.isVisible()).toBe(true);

    await submit.click();
    expect(await page.textContent("body")).toContain("Invalid email");

    await page.goto(new URL("/dates", hostname).href);
    await page.waitForLoadState("networkidle");
    await waitForHydration();

    const input = await page.getByPlaceholder("Date input");
    await input.fill("1982/06/15");

    await nextAnimationFrame();
    await input.blur();
    await nextAnimationFrame();
    expect(await input.getAttribute("value")).toContain("June 15, 1982");

    const localeSelect = await page.locator('input[aria-haspopup="listbox"]');
    await localeSelect.click();

    const germanLocale = await page.getByText("German");
    await germanLocale.click();
    expect(await input.getAttribute("value")).toContain("Juni 15, 1982");

    await page.goto(new URL("/charts", hostname).href);
    await page.waitForLoadState("networkidle");
    await waitForHydration();

    const charts = await page.locator("svg[class='recharts-surface']");
    expect(await charts.count()).toEqual(2);

    await page.goto(new URL("/notification-system", hostname).href);
    await page.waitForLoadState("networkidle");
    await waitForHydration();

    const showNotification = await page.getByRole("button", {
      name: "Show notification",
    });
    await showNotification.click();

    const notification = await page.locator("div[role='alert']");
    expect(await notification.isVisible()).toBe(true);

    await page.goto(new URL("/spotlight", hostname).href);
    await page.waitForLoadState("networkidle");
    await waitForHydration();

    const openSpotlight = await page.getByRole("button", {
      name: "Open spotlight",
    });
    await openSpotlight.click();

    await nextAnimationFrame();

    const search = await page.getByPlaceholder("Search...");
    expect(await search.isVisible()).toBe(true);

    await search.fill("Home");
    await nextAnimationFrame();
    await search.blur();
    await page.waitForTimeout(100);

    const homeItem = await page.getByRole("button", { name: "Home" });
    expect(await homeItem.isVisible()).toBe(true);

    await homeItem.click();
    await page.waitForTimeout(500);
    expect(await search.isVisible()).toBe(false);

    await page.goto(new URL("/carousel", hostname).href);
    await page.waitForLoadState("networkidle");
    await waitForHydration();

    const carouselContainer = await page.locator(
      "div[class*='mantine-Carousel-container']"
    );
    const carouselContainerStyle =
      await carouselContainer.getAttribute("style");

    const right = await page.locator("button[tabindex='0']");
    await right.click();

    await page.waitForTimeout(100);
    const rightStyle = await carouselContainer.getAttribute("style");
    expect(rightStyle).not.toEqual(carouselContainerStyle);

    await page.goto(new URL("/navigationprogress", hostname).href);
    await page.waitForLoadState("networkidle");
    await waitForHydration();

    const startProgress = await page.getByRole("button", { name: "Start" });
    await startProgress.click();

    await page.waitForTimeout(500);
    const progressBar = await page.locator("div[role='progressbar']");
    expect(await progressBar.isVisible()).toBe(true);

    await page.goto(new URL("/modalsmanager", hostname).href);
    await page.waitForLoadState("networkidle");
    await waitForHydration();

    const openConfirmModal = await page.getByRole("button", {
      name: "Open confirm modal",
    });
    await openConfirmModal.click();
    await page.waitForTimeout(100);

    const confirmModal = await page.locator("section[role='dialog']");
    expect(await confirmModal.isVisible()).toBe(true);

    const confirmModalClose = await page.getByRole("button", {
      name: "Confirm",
    });
    await confirmModalClose.click();
    await page.waitForTimeout(500);
    expect(await confirmModal.isVisible()).toBe(false);

    await page.goto(new URL("/rte", hostname).href);
    await page.waitForLoadState("networkidle");
    await waitForHydration();

    expect(await page.textContent("body")).toContain(
      "Welcome to Mantine rich text editor"
    );
  },
  {
    timeout: 360000,
  }
);
