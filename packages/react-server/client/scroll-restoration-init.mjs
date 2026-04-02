/**
 * Early scroll restoration script.
 *
 * This module is injected as a `<script type="module">` into `<head>` before
 * the main hydration entry. It runs after HTML parsing but before React
 * hydrates, restoring the saved scroll position from sessionStorage so the
 * user never sees the page at the wrong position.
 *
 * The companion `<ScrollRestoration>` React component handles ongoing
 * save/restore for client-side navigations. This script only handles the
 * initial page load (refresh / back-forward cache restore).
 */

const STORAGE_KEY = "react-server:scroll";

// Disable browser scroll restoration immediately.
// This MUST happen as early as possible to prevent the browser from
// scrolling to (0,0) or its own saved position before we can restore ours.
if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}

try {
  const scrollKey = history.state?.__scrollKey;
  if (scrollKey) {
    const raw = sessionStorage.getItem(`${STORAGE_KEY}:${scrollKey}`);
    if (raw) {
      const { x, y } = JSON.parse(raw);
      // scrollTo is synchronous — if the DOM content is already parsed
      // (which it is, since module scripts are deferred), this works
      // immediately without any flash.
      window.scrollTo(x, y);
    }
  }
} catch {
  // sessionStorage may be blocked or corrupted — fail silently
}
