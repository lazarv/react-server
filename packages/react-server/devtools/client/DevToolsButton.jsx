"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 33.866666 33.866667"><g transform="matrix(1.4232434,0,0,1.4232434,16.915196,17.10368)"><g stroke="#61dafb" stroke-width="1" fill="none"><ellipse rx="11" ry="4.2"/><ellipse rx="11" ry="4.2" transform="rotate(60)"/><ellipse rx="11" ry="4.2" transform="rotate(120)"/></g><ellipse fill="#61dafb" ry="4.826261" rx="4.215796" cy="0.159" cx="-0.032"/></g><path fill="#ffd22a" stroke="#fff" stroke-width="0.4" stroke-linejoin="round" stroke-linecap="round" d="m12.51,30.69-.058-.057v-.112l.769-2.092.769-2.093.557-1.543.557-1.543.006-.12.006-.12-1.471.006-1.471.006-.062-.073-.062-.073.233-.469.233-.469.856-1.667.856-1.667.418-.86.418-.859-.029-.046-.029-.046-1.464.019-1.464.019-.094-.049-.093-.048v-.173l.11-.213.11-.214 1.014-2.024 1.014-2.024.697-1.43.697-1.43.701-1.401.701-1.401 2.502-.045 2.502-.045.031.079.032.079-.046.126-.046.127-.768 1.329-.768 1.329-.668 1.18-.668 1.18.026.065.026.064 1.695-.022 1.695-.022.077.075.076.074v.123l-.25.407-.249.406-.614.968-.615.968-1.187 1.912-1.187 1.911-.069.137-.069.137.027.067.027.068 1.624-.021 1.624-.021.093.066.093.066-.046.123-.045.123-1.349 1.664-1.349 1.664-.806 1.019-.806 1.018-.67.825-.67.825-1.725 2.146-1.725 2.147h-.12z"/></svg>`;

const STORAGE_KEY = "__react_server_devtools__";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

const POSITIONS = {
  "bottom-right": { bottom: 16, right: 16 },
  "bottom-left": { bottom: 16, left: 16 },
  "top-right": { top: 16, right: 16 },
  "top-left": { top: 16, left: 16 },
};

// Dock mode icon SVG paths (Lucide-style)
function DockIcon({ mode, active, color, hoverColor, onSelect }) {
  const paths = {
    bottom: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="3" y1="15" x2="21" y2="15" />
      </>
    ),
    left: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="9" y1="3" x2="9" y2="21" />
      </>
    ),
    right: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="15" y1="3" x2="15" y2="21" />
      </>
    ),
    float: (
      <>
        <rect x="5" y="5" width="14" height="14" rx="2" />
        <polyline points="9 3 9 1 21 1 23 3 23 15 21 17" />
      </>
    ),
  };
  return (
    <button
      title={`Dock ${mode}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(mode);
      }}
      style={{
        background: "none",
        border: "none",
        color: active ? hoverColor || color : color,
        cursor: "pointer",
        padding: "2px 3px",
        lineHeight: 1,
        display: "flex",
        alignItems: "center",
        opacity: active ? 1 : 0.6,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = hoverColor;
        e.currentTarget.style.opacity = "1";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = active ? hoverColor : color;
        e.currentTarget.style.opacity = active ? "1" : "0.6";
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fillOpacity={active ? 0.2 : 0}
      >
        {paths[mode]}
      </svg>
    </button>
  );
}

const DEFAULT_FLOAT = { x: 100, y: 100, width: 720, height: 420 };

const TRANSITION_MS = 250;
const DOCK_TRANSITION_MS = 400;
const DOCK_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

export default function DevToolsButton({
  position = "bottom-right",
  version = "",
}) {
  // Always start closed to match server render — restore from localStorage after hydration
  const [open, setOpen] = useState(false);
  const [dockMode, setDockMode] = useState("bottom"); // bottom | left | right | float
  const [panelHeight, setPanelHeight] = useState(350);
  const [panelWidth, setPanelWidth] = useState(450);
  const [floatRect, setFloatRect] = useState(DEFAULT_FLOAT);
  const [dragging, setDragging] = useState(false);
  const [dark, setDark] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  // Animation states: mounted = in DOM, shown = visible (opacity 1)
  const [panelMounted, setPanelMounted] = useState(false);
  const [panelShown, setPanelShown] = useState(false);
  const [btnMounted, setBtnMounted] = useState(false);
  const [btnShown, setBtnShown] = useState(false);
  // Dock-mode transition state
  const [dockTransition, setDockTransition] = useState(false);
  const [winSize, setWinSize] = useState({ w: 0, h: 0 });
  const iframeRef = useRef(null);
  const darkRef = useRef(false);
  darkRef.current = dark;

  // Track window dimensions for explicit coordinate positioning
  useEffect(() => {
    const update = () =>
      setWinSize({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Change dock mode with animation — sets transition flag in the same batch
  // so the render already has the transition active when coordinates change.
  const dockTimerRef = useRef(null);
  const changeDockMode = useCallback(
    (newMode) => {
      if (newMode !== dockMode && panelShown) {
        setDockTransition(true);
        clearTimeout(dockTimerRef.current);
        dockTimerRef.current = setTimeout(
          () => setDockTransition(false),
          DOCK_TRANSITION_MS
        );
      }
      setDockMode(newMode);
    },
    [dockMode, panelShown]
  );

  // Animate open/close transitions
  useEffect(() => {
    if (open) {
      // Open: mount panel, fade out button
      setBtnShown(false);
      setPanelMounted(true);
      const btnTimer = setTimeout(() => setBtnMounted(false), TRANSITION_MS);
      const showTimer = requestAnimationFrame(() =>
        requestAnimationFrame(() => setPanelShown(true))
      );
      return () => {
        clearTimeout(btnTimer);
        cancelAnimationFrame(showTimer);
      };
    } else {
      // Close: fade out panel, mount + show button
      setPanelShown(false);
      setBtnMounted(true);
      const btnTimer = requestAnimationFrame(() =>
        requestAnimationFrame(() => setBtnShown(true))
      );
      const hideTimer = setTimeout(() => setPanelMounted(false), TRANSITION_MS);
      return () => {
        clearTimeout(hideTimer);
        cancelAnimationFrame(btnTimer);
      };
    }
  }, [open]);

  // Restore persisted state after hydration
  useEffect(() => {
    const saved = loadState();
    if (saved.dockMode) setDockMode(saved.dockMode);
    if (saved.panelHeight) setPanelHeight(saved.panelHeight);
    if (saved.panelWidth) setPanelWidth(saved.panelWidth);
    if (saved.floatRect) setFloatRect(saved.floatRect);
    if (saved.open) {
      setOpen(true);
    } else {
      // Show button with fade-in on initial load
      setBtnMounted(true);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setBtnShown(true))
      );
    }
    setHydrated(true);
  }, []);

  // Persist state (skip the initial hydration restore)
  useEffect(() => {
    if (!hydrated) return;
    saveState({ open, dockMode, panelHeight, panelWidth, floatRect });
  }, [open, dockMode, panelHeight, panelWidth, floatRect, hydrated]);

  // Shrink the visible page so docked drawers don't cover content.
  // Uses a CSSStyleSheet programmatically so rules survive React re-renders
  // (inline styles on <html>/<body> get wiped by RSC reconciliation).
  // Static stylesheet for toolbar container queries (created once)
  const toolbarSheetRef = useRef(null);
  useEffect(() => {
    if (!toolbarSheetRef.current) {
      toolbarSheetRef.current = new CSSStyleSheet();
      toolbarSheetRef.current.replaceSync(`
        @container (max-width: 480px) {
          .dt-toolbar-version, .dt-toolbar-label { display: none !important; }
        }
      `);
      document.adoptedStyleSheets = [
        ...document.adoptedStyleSheets,
        toolbarSheetRef.current,
      ];
    }
  }, []);

  // Float mode doesn't shrink the page.
  const sheetRef = useRef(null);
  useEffect(() => {
    if (!sheetRef.current) {
      sheetRef.current = new CSSStyleSheet();
      document.adoptedStyleSheets = [
        ...document.adoptedStyleSheets,
        sheetRef.current,
      ];
    }
    const sheet = sheetRef.current;

    if (!panelShown || dockMode === "float") {
      sheet.replaceSync("");
      return;
    }

    const bodyStyle = getComputedStyle(document.body);
    const marginV =
      (parseFloat(bodyStyle.marginTop) || 0) +
      (parseFloat(bodyStyle.marginBottom) || 0);
    const marginH =
      (parseFloat(bodyStyle.marginLeft) || 0) +
      (parseFloat(bodyStyle.marginRight) || 0);

    // Compute values for all properties so CSS can transition between dock modes.
    // Properties not relevant to the current mode get their neutral value.
    const htmlH =
      dockMode === "bottom" ? `calc(100vh - ${panelHeight}px)` : "100vh";
    const htmlW =
      dockMode === "left" || dockMode === "right"
        ? `calc(100vw - ${panelWidth}px)`
        : "100vw";
    const htmlML = dockMode === "left" ? `${panelWidth}px` : "0px";
    const bodyH =
      dockMode === "bottom"
        ? `calc(100vh - ${panelHeight + marginV}px)`
        : `calc(100vh - ${marginV}px)`;
    const bodyW =
      dockMode === "left" || dockMode === "right"
        ? `calc(100vw - ${panelWidth + marginH}px)`
        : "100vw";

    const trans = dockTransition
      ? `transition: height ${DOCK_TRANSITION_MS}ms ${DOCK_EASE}, width ${DOCK_TRANSITION_MS}ms ${DOCK_EASE}, margin-left ${DOCK_TRANSITION_MS}ms ${DOCK_EASE} !important;`
      : "";

    const css = `
      html { height: ${htmlH} !important; width: ${htmlW} !important; margin-left: ${htmlML} !important; overflow: hidden !important; ${trans} }
      body { height: ${bodyH} !important; width: ${bodyW} !important; min-height: 0 !important; min-width: 0 !important; overflow-y: auto !important; box-sizing: border-box !important; ${trans} }
    `;

    sheet.replaceSync(css);

    return () => sheet.replaceSync("");
  }, [panelShown, dockMode, dockTransition, panelHeight, panelWidth]);

  // Keyboard shortcut: Ctrl+Shift+D / Cmd+Shift+D
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "D") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Detect dark mode from host page (cookie, class, or system preference)
  useEffect(() => {
    function detectDark() {
      // 1. Explicit class on <html> (set by DarkModeSwitch or our toggle)
      if (document.documentElement.classList.contains("dark")) return true;
      if (document.documentElement.classList.contains("light")) return false;
      // 2. Cookie persisted by devtools toggle (works even without DarkModeSwitch)
      if (document.cookie.includes("dark=1")) return true;
      if (document.cookie.includes("dark=0")) return false;
      // 3. System preference
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }

    const isDark = detectDark();
    setDark(isDark);
    // Apply class immediately so the host page matches (covers apps without DarkModeSwitch)
    if (isDark) {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    }

    // Watch class changes on <html>
    const observer = new MutationObserver(() => setDark(detectDark()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // Watch system preference changes
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onMediaChange = () => setDark(detectDark());
    mql.addEventListener("change", onMediaChange);

    return () => {
      observer.disconnect();
      mql.removeEventListener("change", onMediaChange);
    };
  }, []);

  // Sync dark mode to iframe
  useEffect(() => {
    if (!open || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      { type: "devtools:theme", dark },
      "*"
    );
  }, [open, dark]);

  // Listen for postMessage from iframe (ready, highlight, navigate, reload)
  useEffect(() => {
    function onMessage(event) {
      const { data } = event;
      if (!data?.type?.startsWith("devtools:")) return;

      switch (data.type) {
        case "devtools:ready":
          // Iframe just loaded — send current theme immediately
          iframeRef.current?.contentWindow?.postMessage(
            { type: "devtools:theme", dark: darkRef.current },
            "*"
          );
          break;
        case "devtools:navigate":
          window.location.href = data.url;
          break;
        case "devtools:reload-outlet":
          // TODO: trigger outlet reload via react-server client API
          break;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Generic resize handler for any edge
  const startResize = useCallback((e, axis, setter, getter, invert = false) => {
    e.preventDefault();
    const startPos = axis === "x" ? e.clientX : e.clientY;
    const startSize = getter();

    function cleanup() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mouseleave", onMouseLeave);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setDragging(false);
    }

    function onMouseMove(e) {
      e.preventDefault();
      const current = axis === "x" ? e.clientX : e.clientY;
      const delta = invert ? current - startPos : startPos - current;
      const maxSize =
        axis === "x" ? window.innerWidth * 0.85 : window.innerHeight * 0.85;
      setter(Math.max(200, Math.min(startSize + delta, maxSize)));
    }

    function onMouseUp() {
      cleanup();
    }
    function onMouseLeave() {
      cleanup();
    }

    document.body.style.cursor = axis === "x" ? "ew-resize" : "ns-resize";
    document.body.style.userSelect = "none";
    setDragging(true);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mouseleave", onMouseLeave);
  }, []);

  const onResizeMouseDown = useCallback(
    (e) => {
      if (dockMode === "bottom") {
        startResize(e, "y", setPanelHeight, () => panelHeight);
      } else if (dockMode === "right") {
        startResize(e, "x", setPanelWidth, () => panelWidth);
      } else if (dockMode === "left") {
        startResize(e, "x", setPanelWidth, () => panelWidth, true);
      }
    },
    [dockMode, panelHeight, panelWidth, startResize]
  );

  // Float mode: resize from bottom-right corner
  const onFloatResizeMouseDown = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = floatRect.width;
      const startH = floatRect.height;

      function cleanup() {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setDragging(false);
      }

      function onMouseMove(e) {
        e.preventDefault();
        setFloatRect((prev) => ({
          ...prev,
          width: Math.max(360, startW + (e.clientX - startX)),
          height: Math.max(200, startH + (e.clientY - startY)),
        }));
      }

      function onMouseUp() {
        cleanup();
      }

      document.body.style.cursor = "nwse-resize";
      document.body.style.userSelect = "none";
      setDragging(true);
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [floatRect]
  );

  // Float mode: drag to move
  const onFloatDragMouseDown = useCallback(
    (e) => {
      // Only drag from the toolbar area, not from buttons
      if (e.target.closest("button") || e.target.closest("a")) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = floatRect.x;
      const startTop = floatRect.y;

      function cleanup() {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setDragging(false);
      }

      function onMouseMove(e) {
        e.preventDefault();
        setFloatRect((prev) => ({
          ...prev,
          x: Math.max(
            0,
            Math.min(startLeft + (e.clientX - startX), window.innerWidth - 100)
          ),
          y: Math.max(
            0,
            Math.min(startTop + (e.clientY - startY), window.innerHeight - 50)
          ),
        }));
      }

      function onMouseUp() {
        cleanup();
      }

      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
      setDragging(true);
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [floatRect]
  );

  const posStyle = POSITIONS[position] ?? POSITIONS["bottom-right"];

  // Theme-aware colors for the toolbar (runs in host page, no CSS vars)
  const t = dark
    ? {
        btnBg: "#18181b",
        shadow: "0 -2px 16px rgba(0,0,0,0.4)",
        handleBg: "linear-gradient(to bottom, #3f3f46, #27272a)",
        handleBar: "#71717a",
        toolbarBg: "#27272a",
        toolbarBorder: "#3f3f46",
        toolbarFg: "#9ca3af",
        toolbarTitle: "#e5e7eb",
        toolbarHover: "#e5e7eb",
        iframeBg: "#18181b",
      }
    : {
        btnBg: "#ffffff",
        shadow: "0 -2px 16px rgba(0,0,0,0.1)",
        handleBg: "linear-gradient(to bottom, #e5e7eb, #d1d5db)",
        handleBar: "#9ca3af",
        toolbarBg: "#f9fafb",
        toolbarBorder: "#e5e7eb",
        toolbarFg: "#4b5563",
        toolbarTitle: "#111827",
        toolbarHover: "#111827",
        iframeBg: "#ffffff",
      };

  return (
    <>
      {/* Floating button */}
      {btnMounted && (
        <button
          onClick={() => setOpen(true)}
          title="Open React Server DevTools (Ctrl+Shift+D)"
          style={{
            position: "fixed",
            ...posStyle,
            zIndex: 2147483646,
            width: 44,
            height: 44,
            borderRadius: "50%",
            border: dark ? "none" : "1px solid #e5e7eb",
            background: t.btnBg,
            boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            opacity: btnShown ? 0.85 : 0,
            transform: btnShown ? "scale(1)" : "scale(0.8)",
            transition: `opacity ${TRANSITION_MS}ms ease, transform ${TRANSITION_MS}ms ease`,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "1";
            e.currentTarget.style.transform = "scale(1.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = btnShown ? "0.85" : "0";
            e.currentTarget.style.transform = btnShown
              ? "scale(1)"
              : "scale(0.8)";
          }}
          dangerouslySetInnerHTML={{ __html: LOGO_SVG }}
        />
      )}

      {/* Panel */}
      {panelMounted &&
        (() => {
          // Compute explicit coordinates for all dock modes so CSS can interpolate
          const rect =
            dockMode === "float"
              ? {
                  top: floatRect.y,
                  left: floatRect.x,
                  width: floatRect.width,
                  height: floatRect.height,
                }
              : dockMode === "left"
                ? { top: 0, left: 0, width: panelWidth, height: winSize.h }
                : dockMode === "right"
                  ? {
                      top: 0,
                      left: winSize.w - panelWidth,
                      width: panelWidth,
                      height: winSize.h,
                    }
                  : {
                      top: winSize.h - panelHeight,
                      left: 0,
                      width: winSize.w,
                      height: panelHeight,
                    };

          const isFloat = dockMode === "float";
          const dockAnim = dockTransition && !dragging;
          const transitionProps = dockAnim
            ? `top ${DOCK_TRANSITION_MS}ms ${DOCK_EASE}, left ${DOCK_TRANSITION_MS}ms ${DOCK_EASE}, width ${DOCK_TRANSITION_MS}ms ${DOCK_EASE}, height ${DOCK_TRANSITION_MS}ms ${DOCK_EASE}, border-radius ${DOCK_TRANSITION_MS}ms ${DOCK_EASE}, opacity ${TRANSITION_MS}ms ease`
            : dragging
              ? "none"
              : `opacity ${TRANSITION_MS}ms ease`;

          return (
            <div
              style={{
                position: "fixed",
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
                zIndex: 2147483646,
                display: "flex",
                flexDirection:
                  dockMode === "left"
                    ? "row-reverse"
                    : dockMode === "right"
                      ? "row"
                      : "column",
                boxShadow: isFloat ? "0 4px 24px rgba(0,0,0,0.25)" : t.shadow,
                borderRadius: isFloat ? 8 : 0,
                overflow: "hidden",
                border: isFloat ? `1px solid ${t.toolbarBorder}` : "none",
                opacity: panelShown ? 1 : 0,
                transition: transitionProps,
              }}
            >
              {/* Resize handle (invisible during float; visually hidden but space-reserving during dock transitions) */}
              {dockMode !== "float" && (
                <div
                  onMouseDown={dockTransition ? undefined : onResizeMouseDown}
                  style={
                    dockMode === "bottom"
                      ? {
                          height: 6,
                          cursor: dockTransition ? "default" : "ns-resize",
                          background: dockTransition
                            ? "transparent"
                            : t.handleBg,
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }
                      : {
                          width: 6,
                          cursor: dockTransition ? "default" : "ew-resize",
                          background: dockTransition
                            ? "transparent"
                            : t.handleBg.replace(
                                "to bottom",
                                dockMode === "left" ? "to left" : "to right"
                              ),
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }
                  }
                >
                  {!dockTransition && (
                    <div
                      style={
                        dockMode === "bottom"
                          ? {
                              width: 40,
                              height: 2,
                              borderRadius: 1,
                              background: t.handleBar,
                            }
                          : {
                              width: 2,
                              height: 40,
                              borderRadius: 1,
                              background: t.handleBar,
                            }
                      }
                    />
                  )}
                </div>
              )}

              {/* Inner wrapper: column layout for toolbar + iframe (needed for left/right dock) */}
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  minWidth: 0,
                  minHeight: 0,
                  containerType: "inline-size",
                }}
              >
                {/* Toolbar */}
                <div
                  onMouseDown={
                    dockMode === "float" ? onFloatDragMouseDown : undefined
                  }
                  className="dt-toolbar"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0 8px",
                    height: 28,
                    background: t.toolbarBg,
                    borderBottom: `1px solid ${t.toolbarBorder}`,
                    flexShrink: 0,
                    cursor: dockMode === "float" ? "grab" : undefined,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 6,
                      color: t.toolbarFg,
                      fontSize: 11,
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        alignSelf: "center",
                        flexShrink: 0,
                      }}
                      dangerouslySetInnerHTML={{
                        __html: LOGO_SVG.replace(
                          'width="28" height="28"',
                          'width="16" height="16"'
                        ),
                      }}
                    />
                    <span
                      style={{
                        fontWeight: 600,
                        fontFamily:
                          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                        fontSize: 12,
                        color: dark ? "#eab308" : "#111827",
                        whiteSpace: "nowrap",
                      }}
                    >
                      @lazarv/react-server
                    </span>
                    {version && (
                      <span
                        className="dt-toolbar-version"
                        style={{
                          fontFamily: "monospace",
                          fontSize: 10,
                          color: t.toolbarFg,
                        }}
                      >
                        {version.split("/").pop()}
                      </span>
                    )}
                    <span className="dt-toolbar-label">DevTools</span>
                  </div>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 0 }}
                  >
                    {/* Dock mode buttons */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        marginRight: 4,
                        gap: 0,
                      }}
                    >
                      {["bottom", "left", "right", "float"].map((mode) => (
                        <DockIcon
                          key={mode}
                          mode={mode}
                          active={dockMode === mode}
                          color={t.toolbarFg}
                          hoverColor={t.toolbarHover}
                          onSelect={changeDockMode}
                        />
                      ))}
                    </div>
                    <button
                      onClick={() => {
                        const next = !dark;
                        setDark(next);
                        if (next) {
                          document.documentElement.classList.remove("light");
                          document.documentElement.classList.add("dark");
                          document.cookie = "dark=1;path=/";
                        } else {
                          document.documentElement.classList.remove("dark");
                          document.documentElement.classList.add("light");
                          document.cookie = "dark=0;path=/";
                        }
                      }}
                      title={
                        dark ? "Switch to light mode" : "Switch to dark mode"
                      }
                      style={{
                        background: "none",
                        border: "none",
                        color: t.toolbarFg,
                        cursor: "pointer",
                        padding: "2px 6px",
                        lineHeight: 1,
                        display: "flex",
                        alignItems: "center",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = t.toolbarHover)
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color = t.toolbarFg)
                      }
                    >
                      {dark ? (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            fill="currentColor"
                            d="M7 0h2v2H7zM12.88 1.637l1.414 1.415-1.415 1.413-1.413-1.414zM14 7h2v2h-2zM12.95 14.433l-1.414-1.413 1.413-1.415 1.415 1.414zM7 14h2v2H7zM2.98 14.364l-1.413-1.415 1.414-1.414 1.414 1.415zM0 7h2v2H0zM3.05 1.706 4.463 3.12 3.05 4.535 1.636 3.12z"
                          />
                          <path
                            fill="currentColor"
                            d="M8 4C5.8 4 4 5.8 4 8s1.8 4 4 4 4-1.8 4-4-1.8-4-4-4Z"
                          />
                        </svg>
                      ) : (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            fill="currentColor"
                            d="M6.2 1C3.2 1.8 1 4.6 1 7.9 1 11.8 4.2 15 8.1 15c3.3 0 6-2.2 6.9-5.2C9.7 11.2 4.8 6.3 6.2 1Z"
                          />
                          <path
                            fill="currentColor"
                            d="M12.5 5a.625.625 0 0 1-.625-.625 1.252 1.252 0 0 0-1.25-1.25.625.625 0 1 1 0-1.25 1.252 1.252 0 0 0 1.25-1.25.625.625 0 1 1 1.25 0c.001.69.56 1.249 1.25 1.25a.625.625 0 1 1 0 1.25c-.69.001-1.249.56-1.25 1.25A.625.625 0 0 1 12.5 5Z"
                          />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={() => setOpen(false)}
                      title="Close DevTools (Ctrl+Shift+D)"
                      style={{
                        background: "none",
                        border: "none",
                        color: t.toolbarFg,
                        cursor: "pointer",
                        fontSize: 16,
                        padding: "2px 6px",
                        lineHeight: 1,
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = t.toolbarHover)
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color = t.toolbarFg)
                      }
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Iframe */}
                <div style={{ flex: 1, position: "relative" }}>
                  {/* oxlint-disable-next-line react/iframe-missing-sandbox -- same-origin devtools iframe, sandbox breaks CORS */}
                  <iframe
                    ref={iframeRef}
                    title="React Server DevTools"
                    src="/__react_server_devtools__/status"
                    style={{
                      position: "absolute",
                      inset: 0,
                      border: "none",
                      width: "100%",
                      height: "100%",
                      background: t.iframeBg,
                    }}
                  />
                  {/* Transparent overlay blocks iframe from stealing mouse events during resize/drag */}
                  {dragging && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        zIndex: 1,
                      }}
                    />
                  )}
                </div>

                {/* Float mode: corner resize grip */}
                {dockMode === "float" && !dockTransition && (
                  <div
                    onMouseDown={onFloatResizeMouseDown}
                    style={{
                      position: "absolute",
                      bottom: 0,
                      right: 0,
                      width: 16,
                      height: 16,
                      cursor: "nwse-resize",
                      zIndex: 2,
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      style={{ opacity: 0.4 }}
                    >
                      <path
                        d="M14 16L16 14M9 16L16 9M4 16L16 4"
                        stroke={t.handleBar}
                        strokeWidth="1.5"
                      />
                    </svg>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
    </>
  );
}
