import { join } from "node:path";

import {
  hostname,
  page,
  server,
  waitForChange,
  waitForHydration,
} from "playground/utils";
import { beforeAll } from "vitest";
import { describe, expect, test } from "vitest";

process.chdir(join(process.cwd(), "../examples/typed-router"));

beforeAll(async () => {
  await server("./App.tsx");
});

// ── Basic route rendering ──

describe("typed-router — route rendering", () => {
  test("renders home route at /", async () => {
    await page.goto(hostname);
    await page.waitForLoadState("load");
    expect(await page.textContent("body")).toContain("Home");
    expect(await page.textContent("body")).toContain(
      "Welcome to the typed router example"
    );
  });

  test("renders about route at /about", async () => {
    await page.goto(`${hostname}/about`);
    await page.waitForLoadState("load");
    expect(await page.textContent("body")).toContain("About");
    expect(await page.textContent("body")).toContain("server-rendered route");
  });

  test("renders global 404 for unknown paths", async () => {
    await page.goto(`${hostname}/nonexistent`);
    await page.waitForLoadState("load");
    // NotFound is a "use client" component — renders after hydration
    await waitForHydration();
    expect(await page.textContent("body")).toContain("404");
    expect(await page.textContent("body")).toContain("Page Not Found");
  });
});

// ── Typed params with Zod validation ──

describe("typed-router — user route (Zod validate)", () => {
  test("renders user page with valid numeric id", async () => {
    await page.goto(`${hostname}/user/42`);
    await page.waitForLoadState("load");
    expect(await page.textContent("body")).toContain("User Page");
    expect(await page.textContent("body")).toContain("User ID:");
    expect(await page.textContent("body")).toContain("42");
  });

  test("renders user page with different valid id", async () => {
    await page.goto(`${hostname}/user/99`);
    await page.waitForLoadState("load");
    expect(await page.textContent("body")).toContain("User ID:");
    expect(await page.textContent("body")).toContain("99");
  });
});

// ── Scoped fallback routes ──

describe("typed-router — scoped fallback (/user/*)", () => {
  test("renders scoped 404 for invalid user path", async () => {
    await page.goto(`${hostname}/user/abc/xyz`);
    await page.waitForLoadState("load");
    expect(await page.textContent("body")).toContain("User Not Found");
    expect(await page.textContent("body")).toContain("scoped fallback");
  });

  test("global 404 does not catch /user/* paths", async () => {
    await page.goto(`${hostname}/user/abc/xyz`);
    await page.waitForLoadState("load");
    // Should show scoped fallback, not global 404
    expect(await page.textContent("body")).toContain("User Not Found");
    expect(await page.textContent("body")).not.toContain("Page Not Found");
  });

  test("global 404 catches non-user unknown paths", async () => {
    await page.goto(`${hostname}/totally/random/path`);
    await page.waitForLoadState("load");
    await waitForHydration();
    // The global fallback is a "use client" component — it renders after hydration
    expect(await page.textContent("body")).toContain("Page Not Found");
    expect(await page.textContent("body")).not.toContain("User Not Found");
  });
});

// ── Lightweight parse (post route) ──

describe("typed-router — post route (lightweight parse)", () => {
  test("renders post page with slug param", async () => {
    await page.goto(`${hostname}/post/hello-world?tab=content`);
    await page.waitForLoadState("load");
    expect(await page.textContent("body")).toContain("Hello World");
  });

  test("renders comments tab", async () => {
    await page.goto(`${hostname}/post/hello-world?tab=comments`);
    await page.waitForLoadState("load");
    expect(await page.textContent("body")).toContain("Hello World");
    // Comments should be visible
    expect(await page.textContent("body")).toContain(
      "parse is much lighter than Zod"
    );
  });

  test("falls back to content tab for unknown tab value", async () => {
    await page.goto(`${hostname}/post/hello-world?tab=oops`);
    await page.waitForLoadState("load");
    expect(await page.textContent("body")).toContain("Hello World");
    // The parse function falls back unknown values to "content".
    // On initial SSR the tab status shows "oops" (raw param) but the content
    // tab body is rendered because the server-side parse returns "content".
    expect(await page.textContent("body")).toContain("slug=hello-world");
  });

  test("renders related tab with links to other posts", async () => {
    await page.goto(`${hostname}/post/hello-world?tab=related`);
    await page.waitForLoadState("load");
    expect(await page.textContent("body")).toContain("React Server Components");
    expect(await page.textContent("body")).toContain("Typed Routes");
  });

  test("supports query highlight via q param", async () => {
    await page.goto(`${hostname}/post/hello-world?tab=content&q=typed`);
    await page.waitForLoadState("load");
    // The highlight marker should be present
    const marks = await page.$$("mark");
    expect(marks.length).toBeGreaterThan(0);
  });
});

// ── Products route (Zod validate + SearchParams transforms) ──

describe("typed-router — products route (Zod + SearchParams)", () => {
  test("renders products page with default search params", async () => {
    await page.goto(`${hostname}/products`);
    await page.waitForLoadState("load");
    await waitForHydration();
    expect(await page.textContent("body")).toContain("Products");
    // Defaults: sort=name, page=1, min_price=0, max_price=10000
    expect(await page.textContent("body")).toContain("sort=name");
    expect(await page.textContent("body")).toContain("page=1");
  });

  test("applies SearchParams decode transform (price=min-max)", async () => {
    await page.goto(`${hostname}/products?price=50-150&sort=price`);
    await page.waitForLoadState("load");
    await waitForHydration();
    // The price=50-150 should be decoded to min_price=50, max_price=150
    expect(await page.textContent("body")).toContain("min_price=50");
    expect(await page.textContent("body")).toContain("max_price=150");
    expect(await page.textContent("body")).toContain("sort=price");
  });

  test("shows product table with data", async () => {
    await page.goto(`${hostname}/products`);
    await page.waitForLoadState("load");
    await waitForHydration();
    const rows = await page.$$("table tbody tr");
    expect(rows.length).toBeGreaterThan(0);
  });

  test("applies Zod defaults for missing search params", async () => {
    await page.goto(`${hostname}/products`);
    await page.waitForLoadState("load");
    await waitForHydration();
    // Zod .catch() provides defaults: sort=name, page=1, min_price=0, max_price=10000
    expect(await page.textContent("body")).toContain("min_price=0");
    expect(await page.textContent("body")).toContain("max_price=10000");
  });
});

// ── Client-side navigation (Link, useNavigate) ──

describe("typed-router — client-side navigation", () => {
  test("navigates via typed .Link from home to user", async () => {
    await page.goto(hostname);
    await page.waitForLoadState("load");
    await waitForHydration();

    const prevUrl = page.url();
    await page.click('nav a:has-text("User 42")');
    await waitForChange(null, () => page.url(), prevUrl);

    expect(page.url()).toContain("/user/42");
    expect(await page.textContent("body")).toContain("User ID:");
    expect(await page.textContent("body")).toContain("42");
  });

  test("navigates between routes without full page reload", async () => {
    await page.goto(hostname);
    await page.waitForLoadState("load");
    await waitForHydration();

    // Navigate to about
    const prevUrl1 = page.url();
    await page.click('nav a:has-text("About")');
    await waitForChange(null, () => page.url(), prevUrl1);
    expect(page.url()).toContain("/about");
    expect(await page.textContent("body")).toContain("About");

    // Navigate to home
    const prevUrl2 = page.url();
    await page.click('nav a:has-text("Home")');
    await waitForChange(null, () => page.url(), prevUrl2);
    expect(await page.textContent("body")).toContain("Home");
  });

  test("navigates to post with search params via Link", async () => {
    await page.goto(hostname);
    await page.waitForLoadState("load");
    await waitForHydration();

    const prevUrl = page.url();
    await page.click('nav a:has-text("Post (comments)")');
    await waitForChange(null, () => page.url(), prevUrl);

    expect(page.url()).toContain("/post/react-server");
    expect(page.url()).toContain("tab=comments");
  });

  test("navigates to products with search params", async () => {
    await page.goto(hostname);
    await page.waitForLoadState("load");
    await waitForHydration();

    // Click "Products ($50-$150)" which has search params
    const prevUrl = page.url();
    await page.click('nav a:has-text("Products ($50-$150)")');
    await waitForChange(null, () => page.url(), prevUrl);

    expect(page.url()).toContain("/products");
    // The link carries sort/price params
    expect(page.url()).toContain("min_price=50");
    expect(page.url()).toContain("max_price=150");
  });

  test("navigates to scoped fallback via Link", async () => {
    await page.goto(hostname);
    await page.waitForLoadState("load");
    await waitForHydration();

    const prevUrl = page.url();
    await page.click('nav a:has-text("User 404 (scoped)")');
    await waitForChange(null, () => page.url(), prevUrl);

    expect(page.url()).toContain("/user/abc/xyz");
    expect(await page.textContent("body")).toContain("User Not Found");
  });

  test("navigates to global 404 via Link", async () => {
    await page.goto(hostname);
    await page.waitForLoadState("load");
    await waitForHydration();

    const prevUrl = page.url();
    await page.click('nav a:has-text("404 Page")');
    await waitForChange(null, () => page.url(), prevUrl);

    expect(page.url()).toContain("/nonexistent");
    expect(await page.textContent("body")).toContain("Page Not Found");
  });
});

// ── Functional search param updaters ──

describe("typed-router — functional search updaters", () => {
  test("sort buttons update sort param while preserving others", async () => {
    await page.goto(`${hostname}/products`);
    await page.waitForLoadState("load");
    await waitForHydration();

    // Click "Price" sort button
    const prevUrl = page.url();
    await page.click('button:has-text("Price")');
    await waitForChange(null, () => page.url(), prevUrl);

    expect(page.url()).toContain("sort=price");
    expect(await page.textContent("body")).toContain("sort=price");
  });

  test("pagination buttons update page via functional updater", async () => {
    await page.goto(`${hostname}/products`);
    await page.waitForLoadState("load");
    await waitForHydration();

    // Click "Next" button
    const prevUrl = page.url();
    await page.click('button:has-text("Next")');
    await waitForChange(null, () => page.url(), prevUrl);

    expect(page.url()).toContain("page=2");
    expect(await page.textContent("body")).toContain("page=2");
  });

  test("price filter buttons update price params via functional updater", async () => {
    await page.goto(`${hostname}/products`);
    await page.waitForLoadState("load");
    await waitForHydration();

    // Click "$50-$100" price filter
    const prevUrl = page.url();
    await page.click('button:has-text("$50")');
    await waitForChange(null, () => page.url(), prevUrl);

    // URL should have encoded price range
    expect(page.url()).toContain("price=");
    // Decoded values should show in the page
    expect(await page.textContent("body")).toContain("min_price=");
  });
});

// ── Post page tab navigation and search params ──

describe("typed-router — post page tabs", () => {
  test("tab links update search params while keeping slug", async () => {
    await page.goto(`${hostname}/post/hello-world?tab=content`);
    await page.waitForLoadState("load");
    await waitForHydration();

    // Click the "comments" tab link — use href selector to avoid matching nav links
    const prevUrl = page.url();
    const commentsTab = await page.$(
      'a[href*="tab=comments"][href*="/post/hello-world"]'
    );
    expect(commentsTab).not.toBeNull();
    await commentsTab.click();
    await waitForChange(null, () => page.url(), prevUrl);

    expect(page.url()).toContain("/post/hello-world");
    expect(page.url()).toContain("tab=comments");
  });

  test("highlight links add q param", async () => {
    await page.goto(`${hostname}/post/hello-world?tab=content`);
    await page.waitForLoadState("load");
    await waitForHydration();

    // Click a highlight link
    const prevUrl = page.url();
    await page.click('a:has-text("parse")');
    await waitForChange(null, () => page.url(), prevUrl);

    expect(page.url()).toContain("q=parse");
  });
});

// ── Home page has typed links with correct hrefs ──

describe("typed-router — Home page typed links", () => {
  test("user.Link on home page builds correct href", async () => {
    await page.goto(hostname);
    await page.waitForLoadState("load");

    // The home page has user.Link links like "User 1" and "User 42"
    const user1Link = await page.$('a:has-text("User 1")');
    expect(user1Link).not.toBeNull();
    const href = await user1Link.getAttribute("href");
    expect(href).toContain("/user/1");
  });

  test("products.Link on home page builds correct href with search", async () => {
    await page.goto(hostname);
    await page.waitForLoadState("load");

    // The home page has a products link with price filter search params
    // The server-rendered href uses raw params (encode transform is client-side)
    const productsLink = await page.$('a:has-text("Products (price-sorted")');
    expect(productsLink).not.toBeNull();
    const href = await productsLink.getAttribute("href");
    expect(href).toContain("/products");
    expect(href).toContain("min_price=50");
    expect(href).toContain("max_price=150");
  });
});

// ── Browser history navigation ──

describe("typed-router — browser history", () => {
  test("back button returns to previous route", async () => {
    await page.goto(hostname);
    await page.waitForLoadState("load");
    await waitForHydration();

    // Navigate to about
    const prevUrl = page.url();
    await page.click('nav a:has-text("About")');
    await waitForChange(null, () => page.url(), prevUrl);
    expect(page.url()).toContain("/about");

    // Go back
    await page.goBack();
    await page.waitForLoadState("load");
    expect(page.url()).toBe(`${hostname}/`);
    expect(await page.textContent("body")).toContain("Home");
  });

  test("forward button returns to next route", async () => {
    await page.goto(hostname);
    await page.waitForLoadState("load");
    await waitForHydration();

    // Navigate to about
    const prevUrl = page.url();
    await page.click('nav a:has-text("About")');
    await waitForChange(null, () => page.url(), prevUrl);

    // Go back
    await page.goBack();
    await page.waitForLoadState("load");

    // Go forward
    await page.goForward();
    await page.waitForLoadState("load");
    expect(page.url()).toContain("/about");
    expect(await page.textContent("body")).toContain("About");
  });
});
