"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
} from "react";

import "../devtools.css";
import PayloadPanel from "./panels/PayloadPanel.jsx";
import OutletPanel from "./panels/OutletPanel.jsx";
import RemotePanel from "./panels/RemotePanel.jsx";
import LivePanel from "./panels/LivePanel.jsx";
import CachePanel from "./panels/CachePanel.jsx";
import WorkerPanel from "./panels/WorkerPanel.jsx";
import LogsPanel from "./panels/LogsPanel.jsx";
import ComponentRoutes from "./panels/ComponentRoutes.jsx";
import RouteTreeView from "./panels/RouteTreeView.jsx";

const TABS = [
  { id: "status", label: "Status" },
  { id: "payload", label: "Payload" },
  { id: "cache", label: "Cache" },
  { id: "routes", label: "Routes" },
  { id: "outlets", label: "Outlets" },
  { id: "remotes", label: "Remotes" },
  { id: "live", label: "Live" },
  { id: "workers", label: "Workers" },
  { id: "logs", label: "Logs" },
];

const SESSION_KEY = "__react_server_devtools_session__";

function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY)) ?? {};
  } catch {
    return {};
  }
}

function saveSession(state) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export default function DevToolsShell({
  initialDark = false,
  statusPanel,
  routeManifest,
}) {
  const [activeTab, setActiveTab] = useState("status");
  const [payloads, setPayloads] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [componentRoutes, setComponentRoutes] = useState([]);
  const [liveServerState, setLiveServerState] = useState({});
  const [cacheEvents, setCacheEvents] = useState([]);
  const [cacheHydration, setCacheHydration] = useState(null);
  const [serverWorkers, setServerWorkers] = useState([]);
  const [clientWorkers, setClientWorkers] = useState([]);
  const [pageStats, setPageStats] = useState(null);
  const [logEntries, setLogEntries] = useState([]);
  const [hostUrl, setHostUrl] = useState("");
  const [serverPathname, setServerPathname] = useState("");
  const [dark, setDark] = useState(initialDark);
  const [routeFilter, setRouteFilter] = useState("");
  const [routeTypeFilter, setRouteTypeFilter] = useState("all");
  const [payloadFilter, setPayloadFilter] = useState("");
  const [hydrated, setHydrated] = useState(false);

  // Restore session state after hydration to avoid SSR/client mismatch
  useEffect(() => {
    const session = loadSession();
    if (session.activeTab) setActiveTab(session.activeTab);
    if (session.routeFilter) setRouteFilter(session.routeFilter);
    if (session.routeTypeFilter) setRouteTypeFilter(session.routeTypeFilter);
    if (session.payloadFilter) setPayloadFilter(session.payloadFilter);
    setHydrated(true);
  }, []);

  // Persist session state (skip until hydration restore is done)
  useEffect(() => {
    if (!hydrated) return;
    saveSession({ activeTab, routeFilter, routeTypeFilter, payloadFilter });
  }, [activeTab, routeFilter, routeTypeFilter, payloadFilter, hydrated]);

  useEffect(() => {
    function onMessage(event) {
      const { data } = event;
      if (!data?.type?.startsWith("devtools:")) return;

      switch (data.type) {
        case "devtools:payload":
          setPayloads((prev) => [...prev.slice(-49), data.payload]);
          break;
        case "devtools:outlets":
          setOutlets(data.outlets);
          break;
        case "devtools:component-routes":
          setComponentRoutes(data.routes);
          break;
        case "devtools:live-components":
          setLiveServerState((prev) => {
            const next = { ...prev };
            for (const comp of data.components) {
              next[comp.outlet] = comp;
            }
            return next;
          });
          break;
        case "devtools:cache-event":
          setCacheEvents((prev) => [...prev.slice(-199), data.event]);
          break;
        case "devtools:cache-events":
          // Full replace — used for initial connection
          setCacheEvents(data.events.slice(-200));
          break;
        case "devtools:cache-flush-request":
          // Request cache disposed — drop previous request-scoped entries
          setCacheEvents((prev) =>
            prev.filter((e) => e.provider !== "request")
          );
          break;
        case "devtools:cache-invalidated": {
          const keyStr = JSON.stringify(data.keys);
          setCacheEvents((prev) =>
            prev.filter((e) => JSON.stringify(e._keys) !== keyStr)
          );
          break;
        }
        case "devtools:cache-hydration":
          setCacheHydration({
            entries: data.entries,
            totalSize: data.totalSize,
          });
          break;
        case "devtools:worker-components":
          setServerWorkers(data.workers);
          break;
        case "devtools:client-workers":
          setClientWorkers(data.workers);
          break;
        case "devtools:page-stats":
          setPageStats(data.stats);
          break;
        case "devtools:log-entry":
          setLogEntries((prev) => [...prev.slice(-999), data.entry]);
          break;
        case "devtools:log-entries":
          setLogEntries(data.entries.slice(-1000));
          break;
        case "devtools:navigate":
          setHostUrl(data.url);
          if (data.serverPathname) setServerPathname(data.serverPathname);
          break;
        case "devtools:theme":
          setDark(data.dark);
          break;
      }
    }

    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "devtools:ready" }, "*");

    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [dark]);

  const highlight = useCallback((selector, color, label) => {
    window.parent.postMessage(
      { type: "devtools:highlight", selector, color, label },
      "*"
    );
  }, []);

  const clearHighlight = useCallback(() => {
    window.parent.postMessage({ type: "devtools:clear-highlight" }, "*");
  }, []);

  const scrollIntoView = useCallback((selector) => {
    window.parent.postMessage(
      { type: "devtools:scroll-into-view", selector },
      "*"
    );
  }, []);

  const navigateOutlet = useCallback((outletName) => {
    setActiveTab("outlets");
    // Wait for the tab switch to render, then scroll to the outlet card
    requestAnimationFrame(() => {
      const card = document.querySelector(`[data-outlet-name="${outletName}"]`);
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        card.classList.add("dt-card-flash");
        setTimeout(() => card.classList.remove("dt-card-flash"), 1500);
      }
    });
  }, []);

  // ── Tab overflow detection ──
  const tabsRef = useRef(null);
  const tabWidthsRef = useRef(null);
  const [visibleCount, setVisibleCount] = useState(TABS.length);
  const [overflowOpen, setOverflowOpen] = useState(false);

  useLayoutEffect(() => {
    const container = tabsRef.current;
    if (!container) return;

    const OVERFLOW_BTN_WIDTH = 36;

    // Capture natural tab widths once (all tabs are rendered on first mount)
    if (!tabWidthsRef.current) {
      const buttons = container.querySelectorAll(".dt-tab");
      tabWidthsRef.current = Array.from(buttons).map(
        (btn) => btn.getBoundingClientRect().width + 1 // +1 for gap
      );
    }

    const widths = tabWidthsRef.current;

    function measure() {
      const containerWidth = container.clientWidth;
      let usedWidth = 0;
      let count = 0;

      // First pass: how many tabs fit without the overflow button?
      for (let i = 0; i < widths.length; i++) {
        if (usedWidth + widths[i] <= containerWidth) {
          usedWidth += widths[i];
          count++;
        } else {
          break;
        }
      }

      // All tabs fit — no overflow needed
      if (count >= widths.length) {
        setVisibleCount(widths.length);
        return;
      }

      // Not all fit — reserve space for the overflow button and re-count
      usedWidth = 0;
      count = 0;
      for (let i = 0; i < widths.length; i++) {
        if (usedWidth + widths[i] + OVERFLOW_BTN_WIDTH <= containerWidth) {
          usedWidth += widths[i];
          count++;
        } else {
          break;
        }
      }

      setVisibleCount(Math.max(1, count));
    }

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Close overflow dropdown on outside click
  useEffect(() => {
    if (!overflowOpen) return;
    const close = () => setOverflowOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [overflowOpen]);

  const visibleTabs = TABS.slice(0, visibleCount);
  const overflowTabs = TABS.slice(visibleCount);
  // If active tab is in the overflow, swap it with the last visible tab
  const activeInOverflow = overflowTabs.find((t) => t.id === activeTab);
  if (activeInOverflow && visibleTabs.length > 0) {
    const lastIdx = visibleTabs.length - 1;
    const swapped = visibleTabs[lastIdx];
    visibleTabs[lastIdx] = activeInOverflow;
    overflowTabs[overflowTabs.indexOf(activeInOverflow)] = swapped;
  }

  return (
    <div className="dt-shell">
      <nav className="dt-tabs" ref={tabsRef}>
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            className="dt-tab"
            data-active={tab.id === activeTab}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
        <div
          className="dt-tab-overflow-wrapper"
          style={
            overflowTabs.length === 0
              ? { visibility: "hidden", width: 0, overflow: "hidden" }
              : undefined
          }
        >
          <button
            className="dt-tab dt-tab-overflow-btn"
            onClick={(e) => {
              e.stopPropagation();
              setOverflowOpen((v) => !v);
            }}
            title="More tabs"
          >
            »
          </button>
          {overflowOpen && overflowTabs.length > 0 && (
            <div className="dt-tab-overflow-menu">
              {overflowTabs.map((tab) => (
                <button
                  key={tab.id}
                  className="dt-tab-overflow-item"
                  data-active={tab.id === activeTab}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setOverflowOpen(false);
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </nav>

      <main className="dt-main">
        <div className="dt-panel" data-visible={activeTab === "status"}>
          {statusPanel}
        </div>
        <div className="dt-panel" data-visible={activeTab === "payload"}>
          <PayloadPanel
            payloads={payloads}
            filter={payloadFilter}
            onFilterChange={setPayloadFilter}
            onHighlight={highlight}
            onClearHighlight={clearHighlight}
            reactServerRoot={routeManifest?.rootDir}
            pageStats={pageStats}
          />
        </div>
        <div className="dt-panel" data-visible={activeTab === "routes"}>
          {!routeManifest && componentRoutes.length === 0 ? (
            <div className="dt-empty">
              <div className="dt-empty-icon">🗺️</div>
              <div className="dt-empty-title">No routes detected.</div>
              <div className="dt-empty-subtitle">
                Use the file-router or <code>&lt;Route&gt;</code> components to
                see your routes here.
              </div>
            </div>
          ) : (
            <>
              <RouteTreeView
                manifest={routeManifest}
                filter={routeFilter}
                onFilterChange={setRouteFilter}
                typeFilter={routeTypeFilter}
                onTypeFilterChange={setRouteTypeFilter}
                serverPathname={serverPathname}
              />
              <ComponentRoutes
                routes={componentRoutes}
                hostUrl={hostUrl}
                outlets={outlets}
              />
            </>
          )}
        </div>
        <div className="dt-panel" data-visible={activeTab === "cache"}>
          <CachePanel events={cacheEvents} hydration={cacheHydration} />
        </div>
        <div className="dt-panel" data-visible={activeTab === "outlets"}>
          <OutletPanel
            outlets={outlets}
            hostUrl={hostUrl}
            onHighlight={highlight}
            onClearHighlight={clearHighlight}
            onScrollIntoView={scrollIntoView}
          />
        </div>
        <div className="dt-panel" data-visible={activeTab === "remotes"}>
          <RemotePanel
            components={outlets.filter((o) => o.remote)}
            onHighlight={highlight}
            onClearHighlight={clearHighlight}
            onNavigateOutlet={navigateOutlet}
            onScrollIntoView={scrollIntoView}
          />
        </div>
        <div className="dt-panel" data-visible={activeTab === "live"}>
          <LivePanel
            components={outlets.filter((o) => o.live)}
            serverState={liveServerState}
          />
        </div>
        <div className="dt-panel" data-visible={activeTab === "workers"}>
          <WorkerPanel
            serverWorkers={serverWorkers}
            clientWorkers={clientWorkers}
          />
        </div>
        <div className="dt-panel" data-visible={activeTab === "logs"}>
          <LogsPanel entries={logEntries} onClear={() => setLogEntries([])} />
        </div>
      </main>
    </div>
  );
}
