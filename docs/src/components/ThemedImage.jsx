"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * Renders a theme-aware image that swaps between light and dark variants.
 * Clicking the image opens a lightbox with a FLIP animation — the image
 * smoothly transitions from its inline position/size to centered in the
 * viewport, and reverses on close.
 *
 * Mobile-friendly:
 * - Recalculates layout on resize / orientation change.
 * - Uses the image's natural aspect ratio.
 * - Supports pinch-to-zoom and drag/pan via pointer events.
 * - Double-tap toggles between 1× and 2× zoom.
 *
 * Usage in MDX:
 *   <ThemedImage light="/devtools-overview-light.webp" dark="/devtools-overview-dark.webp" alt="DevTools overview" />
 */
export default function ThemedImage({ light, dark, alt }) {
  const [state, setState] = useState("closed"); // closed | opening | open | closing
  const [sourceRect, setSourceRect] = useState(null);
  const [naturalAspect, setNaturalAspect] = useState(null);
  // Counter that increments on resize to force re-render while open
  const [, setResizeTick] = useState(0);
  const lightRef = useRef(null);
  const darkRef = useRef(null);
  const imgRef = useRef(null);

  // -- Gesture state (refs to avoid re-renders during gestures) -----------
  const gestureRef = useRef({
    // Current transform
    scale: 1,
    translateX: 0,
    translateY: 0,
    // Pinch tracking
    pointers: new Map(), // pointerId → {x, y}
    initialPinchDist: 0,
    initialScale: 1,
    // Pan tracking
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    startTranslateX: 0,
    startTranslateY: 0,
    // Tap detection
    lastTapTime: 0,
    didGesture: false,
  });

  const applyTransform = useCallback(() => {
    const el = imgRef.current;
    if (!el) return;
    const g = gestureRef.current;
    el.style.transform = `translate(${g.translateX}px, ${g.translateY}px) scale(${g.scale})`;
  }, []);

  const resetGesture = useCallback(() => {
    const g = gestureRef.current;
    g.scale = 1;
    g.translateX = 0;
    g.translateY = 0;
    g.pointers.clear();
    g.initialPinchDist = 0;
    g.isPanning = false;
    g.didGesture = false;
  }, []);

  // Get the currently visible inline image element
  const getVisibleRef = useCallback(() => {
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

  // Capture the inline image's bounding rect
  const captureSourceRect = useCallback(() => {
    const el = getVisibleRef();
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const captured = {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    };
    setSourceRect(captured);
    return captured;
  }, [getVisibleRef]);

  const handleOpen = useCallback(() => {
    const el = getVisibleRef();
    if (!el) return;
    if (el.naturalWidth && el.naturalHeight) {
      setNaturalAspect(el.naturalWidth / el.naturalHeight);
    }
    resetGesture();
    captureSourceRect();
    setState("opening");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setState("open"));
    });
  }, [getVisibleRef, captureSourceRect, resetGesture]);

  const handleClose = useCallback(() => {
    // Animate zoom back to 1× before closing so the FLIP animation is clean
    const el = imgRef.current;
    if (el) {
      el.style.transform = "";
    }
    resetGesture();
    captureSourceRect();
    setState("closing");
  }, [captureSourceRect, resetGesture]);

  // After close animation, unmount
  const handleTransitionEnd = useCallback(() => {
    if (state === "closing") {
      setState("closed");
      setSourceRect(null);
      setNaturalAspect(null);
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

  // Recalculate on resize / orientation change while lightbox is open.
  useEffect(() => {
    if (state !== "open") return;
    let rafId = 0;
    const onResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setResizeTick((t) => t + 1);
      });
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, [state]);

  // -- Pointer event handlers for pinch-zoom and pan ---------------------
  const handlePointerDown = useCallback(
    (e) => {
      if (state !== "open") return;
      const g = gestureRef.current;
      g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      g.didGesture = false;

      if (g.pointers.size === 2) {
        // Start pinch
        const [a, b] = [...g.pointers.values()];
        g.initialPinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        g.initialScale = g.scale;
        g.isPanning = false;
      } else if (g.pointers.size === 1 && g.scale > 1) {
        // Start pan (only when zoomed in)
        g.isPanning = true;
        g.panStartX = e.clientX;
        g.panStartY = e.clientY;
        g.startTranslateX = g.translateX;
        g.startTranslateY = g.translateY;
      }

      // Capture pointer so we get move/up even outside the element
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [state]
  );

  const handlePointerMove = useCallback(
    (e) => {
      const g = gestureRef.current;
      if (!g.pointers.has(e.pointerId)) return;
      g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (g.pointers.size === 2) {
        // Pinch zoom
        const [a, b] = [...g.pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (g.initialPinchDist > 0) {
          g.scale = Math.max(
            1,
            Math.min(5, g.initialScale * (dist / g.initialPinchDist))
          );
          g.didGesture = true;
          // If zoomed back to 1×, reset translation
          if (g.scale === 1) {
            g.translateX = 0;
            g.translateY = 0;
          }
          applyTransform();
        }
      } else if (g.pointers.size === 1 && g.isPanning) {
        // Pan
        const dx = e.clientX - g.panStartX;
        const dy = e.clientY - g.panStartY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          g.didGesture = true;
        }
        g.translateX = g.startTranslateX + dx;
        g.translateY = g.startTranslateY + dy;
        applyTransform();
      }
    },
    [applyTransform]
  );

  const handlePointerUp = useCallback(
    (e) => {
      const g = gestureRef.current;
      g.pointers.delete(e.pointerId);

      if (g.pointers.size < 2) {
        g.initialPinchDist = 0;
      }

      // When the last pointer lifts and no gesture occurred, treat as a tap
      if (g.pointers.size === 0) {
        if (!g.didGesture) {
          const now = Date.now();
          const timeSinceLastTap = now - g.lastTapTime;
          g.lastTapTime = now;

          if (timeSinceLastTap < 300) {
            // Double-tap: toggle between 1× and 2× zoom
            if (g.scale > 1) {
              g.scale = 1;
              g.translateX = 0;
              g.translateY = 0;
            } else {
              g.scale = 2;
              // Zoom towards tap position
              const el = imgRef.current;
              if (el) {
                const rect = el.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                g.translateX = (cx - e.clientX) * (g.scale - 1);
                g.translateY = (cy - e.clientY) * (g.scale - 1);
              }
            }
            applyTransform();
            g.lastTapTime = 0; // Reset so triple-tap doesn't re-trigger
          }
          // Single tap close is handled after a short delay to wait for
          // potential double-tap — see the timeout below
        }
        g.isPanning = false;
      }
    },
    [applyTransform]
  );

  // Single-tap-to-close: fire only when not zoomed and no double-tap follows.
  // We handle this in a separate effect-based handler because the pointer-up
  // handler can't set a timeout that reliably accesses the latest handleClose.
  const backdropRef = useRef(null);
  useEffect(() => {
    if (state !== "open") return;
    const el = backdropRef.current;
    if (!el) return;
    let tapTimer = 0;
    const onPointerUp = () => {
      const g = gestureRef.current;
      // Only consider when all pointers are up and no gesture happened
      if (g.pointers.size !== 0 || g.didGesture) return;
      // Wait to rule out double-tap
      clearTimeout(tapTimer);
      tapTimer = setTimeout(() => {
        // If lastTapTime was reset to 0, a double-tap was handled — skip
        if (g.lastTapTime === 0) return;
        // Only close when not zoomed in
        if (g.scale <= 1) {
          handleClose();
        }
      }, 300);
    };
    el.addEventListener("pointerup", onPointerUp);
    return () => {
      clearTimeout(tapTimer);
      el.removeEventListener("pointerup", onPointerUp);
    };
  }, [state, handleClose]);

  // Compute the target (centered) rect for the lightbox image
  const getTargetStyle = useCallback(() => {
    const aspect =
      naturalAspect ||
      (sourceRect && sourceRect.height > 0
        ? sourceRect.width / sourceRect.height
        : null);
    if (!aspect) return null;
    const padding =
      Math.min(window.innerWidth, window.innerHeight) < 600 ? 0.95 : 0.9;
    const vw = window.innerWidth * padding;
    const vh = window.innerHeight * padding;
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
  }, [sourceRect, naturalAspect]);

  const isActive = state !== "closed";
  const isExpanded = state === "open";
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
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
          <div
            ref={backdropRef}
            className="fixed inset-0 z-[9999] w-full h-full"
            style={{
              backgroundColor: isExpanded
                ? "rgba(0, 0, 0, 0.85)"
                : "rgba(0, 0, 0, 0)",
              transition: "background-color 300ms ease",
              cursor: isExpanded ? "zoom-out" : "default",
              touchAction: "none", // prevent browser gestures (scroll, native pinch)
            }}
            onClick={(e) => {
              // Desktop click-to-close (only when not zoomed)
              if (
                e.target === backdropRef.current &&
                gestureRef.current.scale <= 1
              ) {
                handleClose();
              }
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <img
              ref={imgRef}
              src={getVisibleSrc()}
              alt={alt}
              className="rounded-lg shadow-2xl select-none"
              draggable={false}
              onTransitionEnd={handleTransitionEnd}
              style={{
                position: "fixed",
                top: currentStyle.top,
                left: currentStyle.left,
                width: currentStyle.width,
                height: currentStyle.height,
                transition:
                  state === "open"
                    ? "none"
                    : "top 300ms ease, left 300ms ease, width 300ms ease, height 300ms ease",
                objectFit: "contain",
                transformOrigin: "center center",
                willChange: "transform",
              }}
            />
          </div>,
          document.body
        )}
    </>
  );
}
