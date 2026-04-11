"use client";

import { useState, useEffect } from "react";

export default function HighlightOverlay() {
  const [highlight, setHighlight] = useState(null);
  const [rect, setRect] = useState(null);

  useEffect(() => {
    function onMessage(event) {
      const { data } = event;
      if (!data?.type?.startsWith("devtools:")) return;

      switch (data.type) {
        case "devtools:highlight":
          setHighlight(data);
          break;
        case "devtools:clear-highlight":
          setHighlight(null);
          setRect(null);
          break;
        case "devtools:scroll-into-view": {
          let el = data.selector ? document.querySelector(data.selector) : null;
          if (el && el.hidden) {
            // Skip past the hidden marker to the first content sibling,
            // filtering out viewport-spanning backdrops.
            const outletName = el.getAttribute("data-devtools-outlet");
            let sibling = el.nextElementSibling;
            let target = sibling;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            while (sibling) {
              if (
                sibling.hasAttribute("data-devtools-outlet-end") &&
                sibling.getAttribute("data-devtools-outlet-end") === outletName
              )
                break;
              if (sibling.hasAttribute("data-devtools-outlet")) break;
              const r = sibling.getBoundingClientRect();
              if (
                r.width > 0 &&
                r.height > 0 &&
                !(r.width >= vw && r.height >= vh)
              ) {
                target = sibling;
                break;
              }
              sibling = sibling.nextElementSibling;
            }
            el = target;
          }
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
          }
          break;
        }
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Find and track the target element(s)
  useEffect(() => {
    if (!highlight?.selector) {
      setRect(null);
      return;
    }

    let el = document.querySelector(highlight.selector);
    if (!el) {
      setRect(null);
      return;
    }

    // Collect all elements to measure.
    // If the matched element is a hidden marker (e.g. <data hidden>),
    // collect all following siblings up to the matching end marker
    // (data-devtools-outlet-end) or the next outlet start marker.
    // This correctly handles outlets whose content renders as multiple
    // sibling elements (e.g. a modal content div + a backdrop button).
    let els = [];
    if (el.hidden) {
      const outletName = el.getAttribute("data-devtools-outlet");
      let sibling = el.nextElementSibling;
      while (sibling) {
        if (
          sibling.hasAttribute("data-devtools-outlet-end") &&
          sibling.getAttribute("data-devtools-outlet-end") === outletName
        )
          break;
        if (sibling.hasAttribute("data-devtools-outlet")) break;
        els.push(sibling);
        sibling = sibling.nextElementSibling;
      }
    }
    if (els.length === 0) {
      els = [el];
    }

    function updateRect() {
      const rects = els
        .map((e) => e.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0);

      if (rects.length === 0) {
        setRect(null);
        return;
      }

      // Filter out viewport-spanning elements (likely backdrops/overlays)
      // so the highlight targets the actual content, not a full-screen backdrop.
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const contentRects = rects.filter(
        (r) => !(r.width >= vw && r.height >= vh)
      );

      const targetRects = contentRects.length > 0 ? contentRects : rects;

      // Union bounding rect of all target elements
      const top = Math.min(...targetRects.map((r) => r.top));
      const left = Math.min(...targetRects.map((r) => r.left));
      const bottom = Math.max(...targetRects.map((r) => r.bottom));
      const right = Math.max(...targetRects.map((r) => r.right));
      setRect({ top, left, width: right - left, height: bottom - top });
    }

    updateRect();

    // Track scroll and resize.
    // When devtools is open, <body> becomes the scroll container
    // (overflow-y: auto) while <html> is overflow: hidden, so
    // window "scroll" never fires. Listen on both to cover all cases.
    const onScroll = () => updateRect();
    window.addEventListener("scroll", onScroll, { passive: true });
    document.body.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    let resizeObserver;
    try {
      resizeObserver = new ResizeObserver(updateRect);
      for (const e of els) {
        resizeObserver.observe(e);
      }
    } catch {
      // ResizeObserver not available
    }

    return () => {
      window.removeEventListener("scroll", onScroll);
      document.body.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      resizeObserver?.disconnect();
    };
  }, [highlight]);

  if (!rect || !highlight) return null;

  const color = highlight.color || "rgba(99, 102, 241, 0.3)";
  const borderColor = highlight.color
    ? highlight.color.replace("0.3)", "0.8)")
    : "rgba(99, 102, 241, 0.8)";

  return (
    <>
      {/* Overlay rectangle */}
      <div
        style={{
          position: "fixed",
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          background: color,
          border: `2px dashed ${borderColor}`,
          borderRadius: 3,
          pointerEvents: "none",
          zIndex: 2147483645,
        }}
      />

      {/* Label */}
      {highlight.label && (
        <div
          style={{
            position: "fixed",
            top: rect.top - 22,
            left: rect.left,
            background: borderColor,
            color: "#fff",
            fontSize: 11,
            fontFamily: "monospace",
            padding: "2px 6px",
            borderRadius: 3,
            pointerEvents: "none",
            zIndex: 2147483645,
            whiteSpace: "nowrap",
          }}
        >
          {highlight.label}
        </div>
      )}
    </>
  );
}
