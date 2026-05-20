import { appDir, hostname, page, server } from "playground/utils";
import { beforeAll, expect, test } from "vitest";

beforeAll(async () => {
  await server("./App.jsx", {
    cwd: appDir("examples/hydration-islands"),
    initialConfig:
      process.env.NODE_ENV === "production" ? undefined : { devtools: true },
  });
});

async function waitForIslandState(id, state, timeout = 30000) {
  await page.waitForFunction(
    ([id, state]) =>
      window.__react_server_hydration_island_states__?.[id] === state,
    [id, state],
    { timeout }
  );
}

async function waitForPageRootHydration(timeout = 30000) {
  await page.waitForFunction(
    () => window.__flightHydration__PAGE_ROOT__ === true,
    undefined,
    { timeout }
  );
}

async function hydrationState() {
  return page.evaluate(() => ({
    href: window.location.href,
    pageRoot: window.__flightHydration__PAGE_ROOT__ ?? null,
    islands: {
      ...window.__react_server_hydration_island_states__,
    },
  }));
}

async function devtoolsOutlets() {
  return page.evaluate(() =>
    (() => {
      const outletData =
        typeof window.__react_server_devtools_outlets__ === "function"
          ? window.__react_server_devtools_outlets__()
          : [];
      const runtimeNames = new Set(outletData.map((outlet) => outlet.name));
      const states = window.__react_server_hydration_island_states__ ?? {};
      const islands = window.__react_server_hydration_islands__ ?? {};
      const islandState = (name) => {
        for (const [id, data] of Object.entries(islands)) {
          if ((data?.outlet || id) === name) {
            return states[id] || "pending";
          }
        }
      };
      for (const el of document.querySelectorAll("[data-devtools-outlet]")) {
        const name = el.getAttribute("data-devtools-outlet");
        if (name && !runtimeNames.has(name)) {
          const island = el.hasAttribute("data-devtools-island");
          const hydrationState = island ? islandState(name) : undefined;
          outletData.push({
            name,
            remote: false,
            island,
            hydrationState,
            hydrated: hydrationState === "hydrated",
          });
          runtimeNames.add(name);
        }
      }
      return outletData;
    })()
  );
}

test("hydration islands hydrate independently without hydrating page root", async () => {
  await page.setViewportSize({ width: 900, height: 500 });
  await page.goto(hostname);
  await page.waitForSelector("[data-react-server-hydration-island=counter]");
  await page.waitForSelector(
    "[data-react-server-hydration-island=visible_counter]"
  );
  await page.waitForSelector(
    "[data-react-server-hydration-island=visible_client_loader]"
  );
  await page.waitForSelector(
    "[data-react-server-hydration-island=rsc_navigation]"
  );

  expect(await page.textContent("body")).toContain("Server-only root");
  expect(await page.textContent("body")).toContain("Idle counter");
  expect(await page.textContent("body")).toContain("Visible counter");
  expect(await page.textContent("body")).toContain(
    "Client loaded on hydration"
  );
  expect(await page.textContent("body")).toContain("Outlet navigation");

  const payloadPlacement = await page.evaluate(() => ({
    cacheKeyCount: document.querySelectorAll(
      "[data-react-server-hydration-island][data-react-server-cache-key]"
    ).length,
    modulePreloads: Array.from(
      document.querySelectorAll('link[rel="modulepreload"]')
    ).map((link) => link.getAttribute("href")),
    requestCacheEntries: Object.values(
      window.__react_server_request_cache_entries__ ?? {}
    ).join(""),
  }));
  expect(payloadPlacement.cacheKeyCount).toBe(4);
  expect(payloadPlacement.requestCacheEntries).toContain("Idle counter");
  expect(payloadPlacement.requestCacheEntries).toContain("Outlet navigation");
  expect(payloadPlacement.requestCacheEntries).toContain("Visible counter");
  expect(payloadPlacement.requestCacheEntries).toContain(
    "VisibilityLoadedClient"
  );
  expect(
    payloadPlacement.modulePreloads.some((href) =>
      href?.includes("VisibilityLoadedClient")
    )
  ).toBe(false);
  expect(payloadPlacement.requestCacheEntries).not.toContain(
    "data-script-attrs"
  );

  await waitForIslandState("counter", "hydrated");
  await waitForIslandState("rsc_navigation", "hydrated");
  expect(await page.textContent("body")).toContain(
    "This subtree is now hydrated as its own outlet."
  );

  let state = await hydrationState();
  const initialHref = state.href;
  expect(state.pageRoot).toBe(null);
  expect(state.islands.counter).toBe("hydrated");
  expect(state.islands.rsc_navigation).toBe("hydrated");
  expect(state.islands.visible_counter).toBe("scheduled");
  expect(state.islands.visible_client_loader).toBe("scheduled");
  expect(
    await page.evaluate(
      () => window.__react_server_visible_client_loader_module_loads__ ?? 0
    )
  ).toBe(0);

  const rscIsland = page.locator(
    "[data-react-server-hydration-island=rsc_navigation]"
  );
  const viewText = rscIsland.locator("[data-testid=rsc-view]");
  const pathText = rscIsland.locator("[data-testid=rsc-path]");
  const renderId = rscIsland.locator("[data-testid=rsc-render-id]");
  expect(await viewText.textContent()).toContain("Overview view");
  expect(await pathText.textContent()).toBe("/");
  const initialRenderId = await renderId.textContent();

  await rscIsland.locator("[data-testid=rsc-details-link]").click();
  await page.waitForFunction(() =>
    document
      .querySelector(
        "[data-react-server-hydration-island=rsc_navigation] [data-testid=rsc-view]"
      )
      ?.textContent?.includes("Details view")
  );
  expect(await viewText.textContent()).toContain("Details view");
  expect(await pathText.textContent()).toBe("/?view=details");

  state = await hydrationState();
  expect(state.href).toBe(initialHref);
  expect(state.pageRoot).toBe(null);

  const renderIdBeforeRefresh = await renderId.textContent();
  await rscIsland.locator("[data-testid=rsc-refresh-link]").click();
  await page.waitForFunction(
    (previous) =>
      document.querySelector(
        "[data-react-server-hydration-island=rsc_navigation] [data-testid=rsc-render-id]"
      )?.textContent !== previous,
    renderIdBeforeRefresh
  );
  expect(await viewText.textContent()).toContain("Details view");
  expect(await pathText.textContent()).toBe("/?view=details");
  expect(await renderId.textContent()).not.toBe(initialRenderId);

  const idleButton = page
    .locator("[data-react-server-hydration-island=counter] button")
    .first();
  await idleButton.click();
  await page.waitForFunction(
    () =>
      document
        .querySelector("[data-react-server-hydration-island=counter] button")
        ?.textContent?.trim() === "Count 8"
  );
  expect((await idleButton.textContent()).trim()).toBe("Count 8");

  const visibleIsland = page.locator(
    "[data-react-server-hydration-island=visible_counter]"
  );
  expect(await visibleIsland.textContent()).toContain(
    "This HTML was rendered on the server"
  );

  await visibleIsland.scrollIntoViewIfNeeded();
  await waitForIslandState("visible_counter", "hydrated");
  expect(await visibleIsland.textContent()).toContain(
    "This subtree is now hydrated as its own outlet."
  );

  const visibleButton = visibleIsland.getByRole("button");
  await visibleButton.click();
  await page.waitForFunction(
    () =>
      document
        .querySelector(
          "[data-react-server-hydration-island=visible_counter] button"
        )
        ?.textContent?.trim() === "Count 22"
  );
  expect((await visibleButton.textContent()).trim()).toBe("Count 22");
  expect(
    await page.evaluate(
      () => window.__react_server_visible_client_loader_module_loads__ ?? 0
    )
  ).toBe(0);

  const visibleClientIsland = page.locator(
    "[data-react-server-hydration-island=visible_client_loader]"
  );
  expect(await visibleClientIsland.textContent()).toContain(
    "This client component is server-rendered HTML for now."
  );

  await visibleClientIsland.scrollIntoViewIfNeeded();
  await waitForIslandState("visible_client_loader", "hydrated");
  await page.waitForFunction(
    () =>
      window.__react_server_visible_client_loader_module_loads__ === 1 &&
      window.__react_server_visible_client_loader_hydrated__ === true
  );
  expect(await visibleClientIsland.textContent()).toContain(
    "The client module loaded after the island became visible."
  );

  const visibleClientButton = visibleClientIsland.getByRole("button");
  await visibleClientButton.click();
  await page.waitForFunction(
    () =>
      document
        .querySelector(
          "[data-react-server-hydration-island=visible_client_loader] button"
        )
        ?.textContent?.trim() === "Enabled"
  );
  expect((await visibleClientButton.textContent()).trim()).toBe("Enabled");

  state = await hydrationState();
  expect(state.href).toBe(initialHref);
  expect(state.pageRoot).toBe(null);
  expect(state.islands.counter).toBe("hydrated");
  expect(state.islands.rsc_navigation).toBe("hydrated");
  expect(state.islands.visible_counter).toBe("hydrated");
  expect(state.islands.visible_client_loader).toBe("hydrated");
});

test("supports every hydration island strategy on one page", async () => {
  await page.setViewportSize({ width: 500, height: 500 });
  await page.goto(`${hostname}?mode=strategies`);

  for (const id of [
    "strategy_load",
    "strategy_idle",
    "strategy_visible",
    "strategy_interaction",
    "strategy_media",
    "strategy_never",
  ]) {
    await page.waitForSelector(`[data-react-server-hydration-island=${id}]`);
  }

  const payloadPlacement = await page.evaluate(() => ({
    cacheKeyCount: document.querySelectorAll(
      "[data-react-server-hydration-island][data-react-server-cache-key]"
    ).length,
    requestCacheEntries: Object.values(
      window.__react_server_request_cache_entries__ ?? {}
    ).join(""),
  }));
  expect(payloadPlacement.cacheKeyCount).toBe(5);
  expect(payloadPlacement.requestCacheEntries).toContain("Load strategy");
  expect(payloadPlacement.requestCacheEntries).toContain("Idle strategy");
  expect(payloadPlacement.requestCacheEntries).toContain("Visible strategy");
  expect(payloadPlacement.requestCacheEntries).toContain(
    "Interaction strategy"
  );
  expect(payloadPlacement.requestCacheEntries).toContain("Media strategy");
  expect(payloadPlacement.requestCacheEntries).not.toContain("Never strategy");

  await waitForIslandState("strategy_load", "hydrated");
  await waitForIslandState("strategy_idle", "hydrated");
  await waitForIslandState("strategy_visible", "scheduled");
  await waitForIslandState("strategy_interaction", "scheduled");
  await waitForIslandState("strategy_media", "scheduled");

  let state = await hydrationState();
  expect(state.pageRoot).toBe(null);
  expect(state.islands.strategy_load).toBe("hydrated");
  expect(state.islands.strategy_idle).toBe("hydrated");
  expect(state.islands.strategy_visible).toBe("scheduled");
  expect(state.islands.strategy_interaction).toBe("scheduled");
  expect(state.islands.strategy_media).toBe("scheduled");
  expect(state.islands.strategy_never).toBeUndefined();

  await page.locator("[data-testid=strategy-load-button]").click();
  await page.waitForFunction(
    () =>
      document
        .querySelector("[data-testid=strategy-load-button]")
        ?.textContent?.trim() === "Count 2"
  );
  await page.locator("[data-testid=strategy-idle-button]").click();
  await page.waitForFunction(
    () =>
      document
        .querySelector("[data-testid=strategy-idle-button]")
        ?.textContent?.trim() === "Count 3"
  );

  await page
    .locator("[data-react-server-hydration-island=strategy_interaction]")
    .hover();
  await waitForIslandState("strategy_interaction", "hydrated");
  await page.locator("[data-testid=strategy-interaction-button]").click();
  await page.waitForFunction(
    () =>
      document
        .querySelector("[data-testid=strategy-interaction-button]")
        ?.textContent?.trim() === "Count 5"
  );

  await page.setViewportSize({ width: 900, height: 500 });
  await waitForIslandState("strategy_media", "hydrated");
  await page.locator("[data-testid=strategy-media-button]").click();
  await page.waitForFunction(
    () =>
      document
        .querySelector("[data-testid=strategy-media-button]")
        ?.textContent?.trim() === "Count 6"
  );

  const visibleIsland = page.locator(
    "[data-react-server-hydration-island=strategy_visible]"
  );
  expect(await visibleIsland.textContent()).toContain(
    "Visible strategy server HTML."
  );
  await visibleIsland.scrollIntoViewIfNeeded();
  await waitForIslandState("strategy_visible", "hydrated");
  await page.locator("[data-testid=strategy-visible-button]").click();
  await page.waitForFunction(
    () =>
      document
        .querySelector("[data-testid=strategy-visible-button]")
        ?.textContent?.trim() === "Count 4"
  );

  const neverButton = page.locator("[data-testid=strategy-never-button]");
  expect(await neverButton.textContent()).toContain("Count 6");
  await neverButton.click();
  await page.waitForTimeout(100);
  expect(await neverButton.textContent()).toContain("Count 6");
  expect(await page.textContent("[data-testid=strategy-never-status]")).toBe(
    "Never strategy server HTML."
  );

  state = await hydrationState();
  expect(state.pageRoot).toBe(null);
  expect(state.islands.strategy_load).toBe("hydrated");
  expect(state.islands.strategy_idle).toBe("hydrated");
  expect(state.islands.strategy_visible).toBe("hydrated");
  expect(state.islands.strategy_interaction).toBe("hydrated");
  expect(state.islands.strategy_media).toBe("hydrated");
  expect(state.islands.strategy_never).toBeUndefined();
});

test("hydrates islands on a page that also hydrates PAGE_ROOT", async () => {
  await page.setViewportSize({ width: 900, height: 500 });
  const hydrationErrors = [];
  const onConsole = (message) => {
    const text = message.text();
    if (
      text.includes("Hydration failed") ||
      text.includes("hydration-mismatch") ||
      text.includes("Minified React error #418") ||
      text.includes("Encountered a script tag while rendering React component")
    ) {
      hydrationErrors.push(text);
    }
  };
  const onPageError = (error) => {
    const text = error.message;
    if (
      text.includes("Hydration failed") ||
      text.includes("hydration-mismatch") ||
      text.includes("Minified React error #418") ||
      text.includes("Encountered a script tag while rendering React component")
    ) {
      hydrationErrors.push(text);
    }
  };
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  try {
    await page.goto(`${hostname}?mode=mixed`);
    await page.waitForSelector(
      "[data-react-server-hydration-island=mixed_counter]"
    );
    await page.waitForSelector(
      "[data-react-server-hydration-island=mixed_visible_client_loader]"
    );
    await waitForPageRootHydration();
    await waitForIslandState("mixed_counter", "hydrated");

    const state = await hydrationState();
    expect(state.pageRoot).toBe(true);
    expect(state.islands.mixed_counter).toBe("hydrated");
    expect(state.islands.mixed_visible_client_loader).toBe("scheduled");
    const payloadPlacement = await page.evaluate(() => ({
      modulePreloads: Array.from(
        document.querySelectorAll('link[rel="modulepreload"]')
      ).map((link) => link.getAttribute("href")),
      pageRootFlight: (window.__react_server_devtools_flight__ ?? []).join(""),
      requestCacheEntries: Object.values(
        window.__react_server_request_cache_entries__ ?? {}
      ).join(""),
      visibleClientLoads:
        window.__react_server_visible_client_loader_module_loads__ ?? 0,
    }));
    expect(payloadPlacement.requestCacheEntries).toContain(
      "Mixed root counter"
    );
    expect(payloadPlacement.requestCacheEntries).toContain(
      "VisibilityLoadedClient"
    );
    expect(
      payloadPlacement.modulePreloads.some((href) =>
        href?.includes("VisibilityLoadedClient")
      )
    ).toBe(false);
    expect(payloadPlacement.visibleClientLoads).toBe(0);
    expect(payloadPlacement.requestCacheEntries).not.toContain(
      "data-script-attrs"
    );
    expect(payloadPlacement.requestCacheEntries).not.toContain(
      "__flightWriter__mixed_counter__"
    );
    if (process.env.NODE_ENV !== "production") {
      expect(payloadPlacement.pageRootFlight).not.toContain(
        "Mixed root counter"
      );
    }
    expect(
      await page
        .locator(
          '[data-devtools-outlet-end="mixed_counter"][data-devtools-island]'
        )
        .count()
    ).toBe(process.env.NODE_ENV === "production" ? 0 : 1);
    expect(
      await page
        .locator(
          '[data-devtools-outlet-end="mixed_visible_client_loader"][data-devtools-island]'
        )
        .count()
    ).toBe(process.env.NODE_ENV === "production" ? 0 : 1);
    expect(
      await page.textContent("[data-testid=root-client-status]")
    ).toContain("The page root is hydrated.");

    const rootButton = page.locator("[data-testid=root-client-button]");
    await rootButton.click();
    await page.waitForFunction(
      () =>
        document
          .querySelector("[data-testid=root-client-button]")
          ?.textContent?.trim() === "Root count 1"
    );
    expect((await rootButton.textContent()).trim()).toBe("Root count 1");

    const islandButton = page
      .locator("[data-react-server-hydration-island=mixed_counter] button")
      .first();
    await islandButton.click();
    await page.waitForFunction(
      () =>
        document
          .querySelector(
            "[data-react-server-hydration-island=mixed_counter] button"
          )
          ?.textContent?.trim() === "Count 32"
    );
    expect((await islandButton.textContent()).trim()).toBe("Count 32");

    const visibleClientIsland = page.locator(
      "[data-react-server-hydration-island=mixed_visible_client_loader]"
    );
    expect(await visibleClientIsland.textContent()).toContain(
      "This client component is server-rendered HTML for now."
    );
    await visibleClientIsland.scrollIntoViewIfNeeded();
    await waitForIslandState("mixed_visible_client_loader", "hydrated");
    await page.waitForFunction(
      () =>
        window.__react_server_visible_client_loader_module_loads__ === 1 &&
        window.__react_server_visible_client_loader_hydrated__ === true
    );
    expect(await visibleClientIsland.textContent()).toContain(
      "The client module loaded after the island became visible."
    );

    const visibleClientButton = visibleClientIsland.getByRole("button");
    await visibleClientButton.click();
    await page.waitForFunction(
      () =>
        document
          .querySelector(
            "[data-react-server-hydration-island=mixed_visible_client_loader] button"
          )
          ?.textContent?.trim() === "Enabled"
    );
    expect((await visibleClientButton.textContent()).trim()).toBe("Enabled");
    expect(hydrationErrors).toEqual([]);
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
  }
});

test("renders use hydrate components as plain content in RSC navigation payloads", async () => {
  await page.setViewportSize({ width: 900, height: 500 });
  await page.goto(`${hostname}?mode=late-empty`);
  await waitForPageRootHydration();
  expect(
    await page
      .locator("[data-react-server-hydration-island=late_counter]")
      .count()
  ).toBe(0);

  await page.locator("[data-testid=show-late-island]").click();
  await page.waitForURL("**/?mode=late-island");
  await page.getByRole("heading", { name: "Navigation island" }).waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector(".island-panel button")?.textContent?.trim() ===
      "Count 41"
  );

  const state = await hydrationState();
  expect(state.pageRoot).toBe(true);
  expect(state.islands.late_counter).toBeUndefined();
  expect(
    await page
      .locator("[data-react-server-hydration-island=late_counter]")
      .count()
  ).toBe(0);

  const counterButton = page.locator(".island-panel button").first();
  await counterButton.click();
  await page.waitForFunction(
    () =>
      document.querySelector(".island-panel button")?.textContent?.trim() ===
      "Count 42"
  );
  expect((await counterButton.textContent()).trim()).toBe("Count 42");
});

test.skipIf(process.env.NODE_ENV === "production")(
  "initializes devtools without page root hydration",
  async () => {
    await page.setViewportSize({ width: 900, height: 500 });
    await page.goto(hostname);
    await page.waitForSelector('[title*="Open React Server DevTools"]');
    await waitForIslandState("counter", "hydrated");
    await waitForIslandState("rsc_navigation", "hydrated");

    const state = await hydrationState();
    const outlets = await devtoolsOutlets();
    const islandOutlets = new Map(
      outlets.map((outlet) => [outlet.name, outlet])
    );
    expect(state.pageRoot).toBe(null);
    expect(await page.locator("#react-server-devtools-root").count()).toBe(1);
    expect(
      await page.evaluate(() => window.__react_server_devtools_config__)
    ).toMatchObject({
      version: "react-server/0.0.0",
    });
    expect(
      await page
        .locator('[data-devtools-outlet-end="counter"][data-devtools-island]')
        .count()
    ).toBe(1);
    expect(
      await page
        .locator(
          '[data-devtools-outlet-end="rsc_navigation"][data-devtools-island]'
        )
        .count()
    ).toBe(1);
    expect(
      await page
        .locator(
          '[data-devtools-outlet-end="visible_counter"][data-devtools-island]'
        )
        .count()
    ).toBe(1);
    expect(
      await page
        .locator(
          '[data-devtools-outlet-end="visible_client_loader"][data-devtools-island]'
        )
        .count()
    ).toBe(1);
    expect(islandOutlets.get("counter")).toMatchObject({
      remote: false,
      island: true,
      hydrationState: "hydrated",
      hydrated: true,
    });
    expect(islandOutlets.get("rsc_navigation")).toMatchObject({
      remote: false,
      island: true,
      hydrationState: "hydrated",
      hydrated: true,
    });
    expect(islandOutlets.get("visible_counter")).toMatchObject({
      remote: false,
      island: true,
      hydrationState: "scheduled",
      hydrated: false,
    });
    expect(islandOutlets.get("visible_client_loader")).toMatchObject({
      remote: false,
      island: true,
      hydrationState: "scheduled",
      hydrated: false,
    });

    await page
      .locator("[data-react-server-hydration-island=visible_counter]")
      .scrollIntoViewIfNeeded();
    await waitForIslandState("visible_counter", "hydrated");

    const hydratedOutlets = new Map(
      (await devtoolsOutlets()).map((outlet) => [outlet.name, outlet])
    );
    expect(hydratedOutlets.get("visible_counter")).toMatchObject({
      remote: false,
      island: true,
      hydrationState: "hydrated",
      hydrated: true,
    });
    expect(hydratedOutlets.get("visible_client_loader")).toMatchObject({
      remote: false,
      island: true,
      hydrationState: "scheduled",
      hydrated: false,
    });
  }
);
