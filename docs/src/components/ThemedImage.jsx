"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * Renders a theme-aware image that swaps between light and dark variants.
 * Clicking the image opens a lightbox with a FLIP animation — the image
 * smoothly transitions from its inline position/size to centered in the
 * viewport, and reverses on close.
 *
 * Usage in MDX:
 *   <ThemedImage light="/devtools-overview-light.webp" dark="/devtools-overview-dark.webp" alt="DevTools overview" />
 */
export default function ThemedImage({ light, dark, alt }) {
  const [state, setState] = useState("closed"); // closed | opening | open | closing
  const [sourceRect, setSourceRect] = useState(null);
  const lightRef = useRef(null);
  const darkRef = useRef(null);

  // Get the currently visible inline image element
  const getVisibleRef = useCallback(() => {
    // Check the parent button's computed display since Tailwind dark: classes are on the wrapper
    const lightBtn = lightRef.current?.parentElement;
    const darkBtn = darkRef.current?.parentElement;
    if (lightBtn && getComputedStyle(lightBtn).display !== "none") {
      return lightRef.current;
    }
    if (darkBtn && getComputedStyle(darkBtn).display !== "none") {
      return darkRef.current;
    }
    return lightRef.current;
  }, []);

  // Get the currently visible image src
  const getVisibleSrc = useCallback(() => {
    const el = getVisibleRef();
    return el === darkRef.current ? dark : light;
  }, [getVisibleRef, light, dark]);

  const handleOpen = useCallback(() => {
    const el = getVisibleRef();
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setSourceRect({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
    setState("opening");
    // Trigger the "open" state on next frame so CSS transition kicks in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setState("open"));
    });
  }, [getVisibleRef]);

  const handleClose = useCallback(() => {
    // Re-capture the inline image position (may have scrolled)
    const el = getVisibleRef();
    if (el) {
      const rect = el.getBoundingClientRect();
      setSourceRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    }
    setState("closing");
  }, [getVisibleRef]);

  // After close animation, unmount
  const handleTransitionEnd = useCallback(() => {
    if (state === "closing") {
      setState("closed");
      setSourceRect(null);
    }
  }, [state]);

  // Close on Escape key
  useEffect(() => {
    if (state === "closed") return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [state, handleClose]);

  // Prevent body scroll when lightbox is active
  useEffect(() => {
    if (state !== "closed") {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [state]);

  // Compute the target (centered) rect for the lightbox image
  const getTargetStyle = useCallback(() => {
    if (!sourceRect || sourceRect.width === 0 || sourceRect.height === 0)
      return null;
    const vw = window.innerWidth * 0.9;
    const vh = window.innerHeight * 0.9;
    const aspect = sourceRect.width / sourceRect.height;
    let w, h;
    if (vw / vh > aspect) {
      h = vh;
      w = h * aspect;
    } else {
      w = vw;
      h = w / aspect;
    }
    return {
      top: (window.innerHeight - h) / 2,
      left: (window.innerWidth - w) / 2,
      width: w,
      height: h,
    };
  }, [sourceRect]);

  const isActive = state !== "closed";
  const isExpanded = state === "open";

  // The rect to apply: source when opening/closing, target when open
  const currentStyle = isExpanded ? getTargetStyle() : sourceRect;

  return (
    <>
      {/* Inline images with vertical margin and cursor hint */}
      <button
        type="button"
        className="dark:hidden p-0 border-0 bg-transparent cursor-zoom-in block"
        onClick={handleOpen}
        style={{ visibility: isActive ? "hidden" : "visible" }}
      >
        <img
          ref={lightRef}
          src={light}
          alt={alt}
          className="rounded-lg shadow-md my-6"
        />
      </button>
      <button
        type="button"
        className="hidden dark:block p-0 border-0 bg-transparent cursor-zoom-in"
        onClick={handleOpen}
        style={{ visibility: isActive ? "hidden" : "visible" }}
      >
        <img
          ref={darkRef}
          src={dark}
          alt={alt}
          className="rounded-lg shadow-md my-6"
        />
      </button>

      {/* Lightbox — portalled to body to escape stacking contexts */}
      {isActive &&
        currentStyle &&
        createPortal(
          <button
            type="button"
            className="fixed inset-0 z-[9999] cursor-zoom-out w-full h-full p-0 border-0"
            onClick={handleClose}
            style={{
              backgroundColor: isExpanded
                ? "rgba(0, 0, 0, 0.85)"
                : "rgba(0, 0, 0, 0)",
              transition: "background-color 300ms ease",
            }}
          >
            <img
              src={getVisibleSrc()}
              alt={alt}
              className="rounded-lg shadow-2xl select-none"
              onTransitionEnd={handleTransitionEnd}
              style={{
                position: "fixed",
                top: currentStyle.top,
                left: currentStyle.left,
                width: currentStyle.width,
                height: currentStyle.height,
                transition:
                  "top 300ms ease, left 300ms ease, width 300ms ease, height 300ms ease",
                objectFit: "contain",
              }}
            />
          </button>,
          document.body
        )}
    </>
  );
}
