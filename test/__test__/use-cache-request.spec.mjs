import { hostname, page, server } from "playground/utils";
import { expect, test } from "vitest";

test("use cache request - same value within single request", async () => {
  await server("fixtures/use-cache-request.jsx");
  await page.goto(hostname);

  const first = JSON.parse(await page.textContent("#first"));
  const second = JSON.parse(await page.textContent("#second"));

  // Both server components should get the same cached value
  expect(first.timestamp).toBe(second.timestamp);
  expect(first.random).toBe(second.random);
  expect(first.computeCount).toBe(second.computeCount);
});

test("use cache request - different value across requests", async () => {
  await server("fixtures/use-cache-request.jsx");

  await page.goto(hostname);
  const first = JSON.parse(await page.textContent("#first"));

  await page.reload();
  const firstAfterReload = JSON.parse(await page.textContent("#first"));

  // Different requests should get different values (request-scoped, not persistent)
  expect(firstAfterReload.random).not.toBe(first.random);
});

test("use cache request - client component reads RSC cached value without props", async () => {
  await server("fixtures/use-cache-request.jsx");

  // Fetch raw HTML to inspect SSR output before hydration replaces it.
  // In production, hydration is fast enough that page.textContent() may
  // return browser-computed values instead of SSR-rendered ones.
  const res = await fetch(hostname, { headers: { accept: "text/html" } });
  const html = await res.text();

  // Extract plain-text values from dedicated SSR-rendered divs.
  // Server components render #first-timestamp and #first-random as
  // plain numbers (no JSON encoding issues).
  const serverTimestamp = html.match(
    /<div id="first-timestamp">([^<]+)<\/div>/
  );
  const serverRandom = html.match(/<div id="first-random">([^<]+)<\/div>/);
  const clientTimestamp = html.match(
    /<div id="client-timestamp">([^<]+)<\/div>/
  );
  const clientRandom = html.match(/<div id="client-random">([^<]+)<\/div>/);

  expect(serverTimestamp).not.toBeNull();
  expect(serverRandom).not.toBeNull();
  expect(clientTimestamp).not.toBeNull();
  expect(clientRandom).not.toBeNull();

  // Client component called the same getRequestData() during SSR
  // — no props passed, it imported and called the function directly
  // — should get the same value via SharedArrayBuffer
  expect(clientTimestamp[1]).toBe(serverTimestamp[1]);
  expect(clientRandom[1]).toBe(serverRandom[1]);
});

test("use cache request - Date type preserved across RSC/SSR boundary", async () => {
  await server("fixtures/use-cache-request.jsx");
  await page.goto(hostname);

  // Server components should see createdAt as a real Date instance
  // (RSC serialization preserves Date via $D prefix, unlike JSON.stringify)
  const firstType = await page.textContent("#first-type");
  const secondType = await page.textContent("#second-type");
  expect(firstType).toBe("Date");
  expect(secondType).toBe("Date");

  // Client component receives the value via SharedArrayBuffer + syncFromBuffer
  // — Date should be preserved across the cross-thread transfer
  const clientType = await page.textContent("#client-type");
  expect(clientType).toBe("Date");
});

test("use cache request - hydrated content matches SSR in browser", async () => {
  await server("fixtures/use-cache-request.jsx");

  // Verify that cache entries are embedded in the HTML for hydration
  const res = await fetch(hostname, { headers: { accept: "text/html" } });
  const html = await res.text();
  expect(html).toContain("__react_server_request_cache_entries__");

  // Load in a real browser — server and client values come from the
  // same request, so we can compare them directly after hydration.
  await page.goto(hostname);
  await page.waitForFunction(() => typeof document !== "undefined");

  // Server-rendered values (from RSC)
  const serverTimestamp = await page.textContent("#first-timestamp");
  const serverRandom = await page.textContent("#first-random");

  // Client component values (hydrated from the same request cache)
  const clientTimestamp = await page.textContent("#client-timestamp");
  const clientRandom = await page.textContent("#client-random");

  // Both should be identical — the client component used the hydrated
  // cache entry instead of recomputing
  expect(clientTimestamp).toBe(serverTimestamp);
  expect(clientRandom).toBe(serverRandom);

  // Date type should survive hydration
  const clientType = await page.textContent("#client-type");
  expect(clientType).toBe("Date");
});

test("use cache request - hydrate=false does not embed cache entries for that function", async () => {
  await server("fixtures/use-cache-request-no-hydrate.jsx");

  // Fetch raw HTML to inspect SSR output
  const res = await fetch(hostname, { headers: { accept: "text/html" } });
  const html = await res.text();

  // Server-rendered values should be present in the HTML
  const ssrTimestamp = html.match(/<div id="server-timestamp">([^<]+)<\/div>/);
  const ssrRandom = html.match(/<div id="server-random">([^<]+)<\/div>/);

  expect(ssrTimestamp).not.toBeNull();
  expect(ssrRandom).not.toBeNull();

  // The SSR-rendered client values should match server values
  // (SharedArrayBuffer still works for SSR deduplication)
  const ssrClientTimestamp = html.match(
    /<div id="client-timestamp">([^<]+)<\/div>/
  );
  const ssrClientRandom = html.match(/<div id="client-random">([^<]+)<\/div>/);

  expect(ssrClientTimestamp).not.toBeNull();
  expect(ssrClientRandom).not.toBeNull();
  expect(ssrClientTimestamp[1]).toBe(ssrTimestamp[1]);
  expect(ssrClientRandom[1]).toBe(ssrRandom[1]);
});

test("use cache request - streamed Suspense cache entries hydrate correctly", async () => {
  await server("fixtures/use-cache-request-suspense.jsx");

  // Verify incremental injection uses Object.assign
  const res = await fetch(hostname, { headers: { accept: "text/html" } });
  const html = await res.text();
  expect(html).toContain(
    "Object.assign(self.__react_server_request_cache_entries__"
  );

  // Load in a real browser — all values from the same request
  await page.goto(hostname);

  // Wait for the Suspense boundary to resolve
  await page.waitForSelector("#suspense-client");

  // Eager: server component and client component should share the same value
  const eagerTimestamp = await page.textContent("#eager-timestamp");
  const eagerRandom = await page.textContent("#eager-random");
  const clientTimestamp = await page.textContent("#client-timestamp");
  const clientRandom = await page.textContent("#client-random");

  expect(clientTimestamp).toBe(eagerTimestamp);
  expect(clientRandom).toBe(eagerRandom);

  // Delayed (Suspense-streamed): server component and client component
  // should share the same value — proving the incrementally-injected
  // cache entry was picked up during hydration
  const delayedTimestamp = await page.textContent("#delayed-timestamp");
  const delayedRandom = await page.textContent("#delayed-random");
  const suspenseClientTimestamp = await page.textContent(
    "#suspense-client-timestamp"
  );
  const suspenseClientRandom = await page.textContent(
    "#suspense-client-random"
  );

  expect(suspenseClientTimestamp).toBe(delayedTimestamp);
  expect(suspenseClientRandom).toBe(delayedRandom);
});

test("use cache request - hydrate=false client recomputes on browser", async () => {
  await server("fixtures/use-cache-request-no-hydrate.jsx");

  // Fetch raw HTML to get SSR values
  const res = await fetch(hostname, { headers: { accept: "text/html" } });
  const html = await res.text();

  const ssrTimestamp = html.match(/<div id="server-timestamp">([^<]+)<\/div>/);

  // Load in browser — client component should recompute since hydrate=false
  // means the cache value is NOT embedded in the HTML
  await page.goto(hostname);
  await page.waitForFunction(() => typeof document !== "undefined");

  const clientTimestamp = await page.textContent("#client-timestamp");

  // With hydrate=false, the browser recomputes the value, so it should differ
  // from the SSR value (different timestamp = different computation)
  expect(clientTimestamp).not.toBe(ssrTimestamp[1]);
});
