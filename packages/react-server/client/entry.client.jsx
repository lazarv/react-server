import { startTransition, StrictMode, Component, useEffect } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";

import ClientProvider, {
  PAGE_ROOT,
  ClientContext,
  streamOptions,
} from "./ClientProvider.jsx";
import ReactServerComponent from "./ReactServerComponent.jsx";
import { RedirectError } from "./client-navigation.mjs";
import {
  flightStreamFromPayload,
  runHydrationStrategy,
} from "./hydration-island-runtime.mjs";
import { getHydrationIslandContent } from "./hydration-island-data.mjs";
import { activateScriptTemplates } from "./script-templates.mjs";

self.__react_server_callServer__ = streamOptions({
  outlet: PAGE_ROOT,
}).callServer;

const initialState = { didCatch: false, error: null };

function findRef(ref, value, visited = new Set()) {
  if (ref === value) {
    return true;
  }
  if (visited.has(value)) {
    return false;
  }
  visited.add(value);
  if (Array.isArray(value)) {
    return value.some((v) => findRef(ref, v, visited));
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).some((v) => findRef(ref, v, visited));
  }
  return false;
}

class ErrorBoundary extends Component {
  static contextType = ClientContext;

  constructor(props) {
    super(props);
    this.state = { ...initialState };
  }

  static getDerivedStateFromError(error) {
    if (error.digest && error.digest.startsWith("Location=")) {
      return initialState;
    }
    return { didCatch: true, error, info: null };
  }

  componentDidMount() {
    window.addEventListener("popstate", this.resetErrorBoundary);
  }

  componentWillUnmount() {
    window.removeEventListener("popstate", this.resetErrorBoundary);
  }

  componentDidCatch(error, info) {
    for (const [key, value] of this.context.state.cache.entries()) {
      if (findRef(error, value)) {
        if (error.digest && error.digest.startsWith("Location=")) {
          this.context.invalidate(key, { noEmit: true });
          const digestLocation = error.digest.replace("Location=", "").trim();
          this.context.state.outlets.set(key, digestLocation || PAGE_ROOT);
          this.context.navigate(digestLocation || PAGE_ROOT, {
            outlet: key,
            external: key !== PAGE_ROOT,
            push: false,
          });
          this.setState(initialState);
        } else {
          this.setState({
            didCatch: true,
            error,
            info,
            outlet: key,
            url: this.context.state.outlets.get(key) || PAGE_ROOT,
          });
        }
        break;
      }
    }
  }

  resetErrorBoundary = async () => {
    const { error, outlet, url } = this.state;
    if (typeof error?.digest === "string") {
      if (outlet !== PAGE_ROOT) {
        self[`__flightHydration__${PAGE_ROOT}__`] = false;
      }
      if (error.digest.startsWith("Location=")) {
        const digestLocation = error.digest.replace("Location=", "").trim();
        if (digestLocation) {
          const url = new URL(digestLocation, location.origin);
          if (url.origin === location.origin) {
            this.setState(initialState);
            this.context.state.outlets.set(outlet, digestLocation);
            this.context.navigate(digestLocation, {
              outlet,
              external: outlet !== PAGE_ROOT,
              push: false,
            });
          } else {
            location.replace(digestLocation);
          }
        }
      } else {
        this.context.invalidate(outlet, { noEmit: true });
        this.context.getFlightResponse(outlet, {
          outlet,
          remote: outlet !== PAGE_ROOT && self[`__flightStream__${outlet}__`],
          url,
          onFetch: () => {
            this.setState(initialState);
          },
        });
      }
    } else {
      this.setState(initialState);
    }
  };

  render() {
    const { didCatch, error } = this.state;

    if (didCatch) {
      const cwd =
        document
          .querySelector(`meta[name="react-server:cwd"]`)
          ?.getAttribute("content") || null;
      return (
        <html lang="en" suppressHydrationWarning>
          <head>
            <title>{document.title || "Error"}</title>
            <meta
              name="viewport"
              content="width=device-width, initial-scale=1"
            />
            <meta charSet="utf-8" />
            {cwd && <meta name="react-server:cwd" content={cwd} />}
            <style
              dangerouslySetInnerHTML={{
                __html: `
              * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
              }

              body {
                font-family: system-ui, -apple-system, sans-serif;
                padding: 2rem;
                line-height: 1.5;
                background: #fff !important;
                display: block;
              }

              h1 {
                font-size: 2rem;
                font-weight: 600;
                margin-bottom: 1rem;
                color: #e11d48;
              }

              pre {
                margin: 1rem 0;
                padding: 1rem;
                background: #f1f5f9;
                color: #374151;
                border-radius: 0.5rem;
                font-size: 0.875rem;
              }

              button {
                padding: 0.5rem 1rem;
                background: #0ea5e9;
                color: #fff;
                border: none;
                border-radius: 0.25rem;
                cursor: pointer;
              }

              button:hover {
                background: #0284c7;
              }
            `,
              }}
            />
          </head>
          <body suppressHydrationWarning>
            <h1>{error.message || "Error"}</h1>
            {error.digest && error.digest !== error.message ? (
              <p
                dangerouslySetInnerHTML={{
                  __html: error.digest.replace(/`([^`]+)`/g, "<code>$1</code>"),
                }}
              />
            ) : null}
            <pre
              style={{
                width: "100%",
                whiteSpace: "pre-wrap",
                wordWrap: "break-word",
              }}
            >
              {import.meta.env.DEV ? error.stack : error.message}
            </pre>
            <button onClick={this.resetErrorBoundary}>Retry</button>
          </body>
        </html>
      );
    }

    return this.props.children;
  }
}

function ReactServer() {
  return (
    <ClientProvider>
      <ErrorBoundary>
        <ReactServerComponent outlet={PAGE_ROOT} url={location.href} />
      </ErrorBoundary>
    </ClientProvider>
  );
}

function HydrationIslandCommitEffect({ id }) {
  useEffect(() => {
    const markHydrated = () => {
      const states = (self.__react_server_hydration_island_states__ ??= {});
      states[id] = "hydrated";
    };
    if (typeof requestAnimationFrame === "function") {
      const frame = requestAnimationFrame(markHydrated);
      return () => cancelAnimationFrame(frame);
    }
    const timeout = setTimeout(markHydrated, 0);
    return () => clearTimeout(timeout);
  }, [id]);

  return null;
}

function readHydrationIslandData(cacheKey) {
  if (!cacheKey) return null;
  const data = getHydrationIslandContent(cacheKey);
  if (data && typeof data.then === "function") {
    return data.status === "fulfilled" ? data.value : null;
  }
  return data;
}

function getHydrationIslandData(element, islands, id) {
  let data = islands[id];
  if (!data) {
    const strategyText = element.getAttribute("data-react-server-strategy");
    let strategy = { type: "load" };
    if (strategyText) {
      try {
        strategy = JSON.parse(strategyText);
      } catch {
        // Keep the default strategy if the marker was malformed.
      }
    }
    data = {
      id,
      outlet: element.getAttribute("data-react-server-outlet") || id,
      url: element.getAttribute("data-react-server-url") || location.href,
      strategy,
      cacheKey: element.getAttribute("data-react-server-cache-key") || null,
    };
    islands[id] = data;
  }

  const devtoolsConfig = element.getAttribute(
    "data-react-server-devtools-config"
  );
  if (devtoolsConfig && !self.__react_server_devtools_config__) {
    try {
      self.__react_server_devtools_config__ = JSON.parse(devtoolsConfig);
    } catch {
      // Ignore malformed devtools metadata.
    }
  }

  return data;
}

function hydrateHydrationIslands() {
  if (hasPageRootHydration()) {
    return;
  }

  const states = (self.__react_server_hydration_island_states__ ??= {});

  const islands = (self.__react_server_hydration_islands__ ??= {});
  for (const element of document.querySelectorAll(
    "[data-react-server-hydration-island]"
  )) {
    const id = element.getAttribute("data-react-server-hydration-island");
    const data = getHydrationIslandData(element, islands, id);
    if (!data) continue;
    if (states[id]) continue;

    const outlet = data.outlet || id;
    const hydrationData = readHydrationIslandData(data.cacheKey);
    if (
      hydrationData?.payload &&
      !data.payload &&
      !self[`__flightStream__${outlet}__`]
    ) {
      data.payload = hydrationData.payload;
    }
    if (!data.payload && !self[`__flightStream__${outlet}__`]) continue;
    states[id] = "scheduled";

    runHydrationStrategy(element, data.strategy, () => {
      if (states[id] === "hydrated" || states[id] === "hydrating") return;
      states[id] = "hydrating";
      if (data.payload) {
        self[`__flightStream__${outlet}__`] = flightStreamFromPayload(
          data.payload
        );
      } else if (!self[`__flightStream__${outlet}__`]) {
        return;
      }
      self[`__flightHydration__${outlet}__`] = false;
      hydrateRoot(
        element,
        <StrictMode>
          <ClientProvider>
            <ErrorBoundary>
              <ReactServerComponent
                outlet={outlet}
                island={true}
                url={data.url || location.href}
              />
              <HydrationIslandCommitEffect id={id} />
            </ErrorBoundary>
          </ClientProvider>
        </StrictMode>
      );
    });
  }
}

function hasPageRootHydration() {
  return (
    typeof self !== "undefined" &&
    (self[`__flightStream__${PAGE_ROOT}__`] ||
      typeof self.__react_server_root__ === "string" ||
      typeof self.__react_server_hydration_container__ === "function")
  );
}

function hasHydrationIslandHints() {
  return (
    typeof self !== "undefined" &&
    (self.__react_server_hydration_islands__ ||
      document.querySelector("[data-react-server-hydration-island]"))
  );
}

let hydrationIslandDomReadyListener = false;

function scheduleHydrationIslands() {
  hydrateHydrationIslands();
  if (typeof queueMicrotask === "function") {
    queueMicrotask(hydrateHydrationIslands);
  } else {
    Promise.resolve().then(hydrateHydrationIslands);
  }
  setTimeout(hydrateHydrationIslands, 0);
}

function bootstrapHydrationIslands() {
  scheduleHydrationIslands();
  if (document.readyState === "loading") {
    if (!hydrationIslandDomReadyListener) {
      hydrationIslandDomReadyListener = true;
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          hydrationIslandDomReadyListener = false;
          scheduleHydrationIslands();
        },
        {
          once: true,
        }
      );
    }
  }
}

function bootstrapStandaloneDevTools() {
  if (
    !import.meta.env.DEV ||
    !self.__react_server_devtools_config__ ||
    self.__react_server_devtools_root__
  ) {
    return;
  }

  self.__react_server_devtools_root__ = true;

  const mount = async () => {
    if (!document.body) {
      setTimeout(mount, 0);
      return;
    }

    const [
      { default: DevToolsButton },
      { default: HighlightOverlay },
      { default: PayloadCollector },
    ] = await Promise.all([
      import("../devtools/client/DevToolsButton.jsx"),
      import("../devtools/client/HighlightOverlay.jsx"),
      import("../devtools/client/PayloadCollector.jsx"),
    ]);

    let container = document.getElementById("react-server-devtools-root");
    if (!container) {
      container = document.createElement("div");
      container.id = "react-server-devtools-root";
      document.body.appendChild(container);
    }

    const config = self.__react_server_devtools_config__ ?? {};
    self.__react_server_devtools_root__ = createRoot(container);
    self.__react_server_devtools_root__.render(
      <StrictMode>
        <DevToolsButton
          position={config.position ?? "bottom-right"}
          version={config.version ?? ""}
        />
        <HighlightOverlay />
        <PayloadCollector />
      </StrictMode>
    );
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
}

if (typeof self !== "undefined") {
  self.__react_server_hydrate_islands__ = () => {
    activateScriptTemplates(document);
    if (hasHydrationIslandHints()) {
      bootstrapHydrationIslands();
    }
  };
}

if (import.meta.env.DEV) {
  if (
    document
      .querySelector(`meta[name="react-server:overlay"]`)
      ?.getAttribute("content") !== "false"
  ) {
    await import("./error-overlay.mjs");
  }
}

// Client-root SSR shortcut: when server/render-ssr.jsx rendered the page,
// an inline <script> set `self.__react_server_root__ = "id#name"` in place
// of the usual inline flight chunks. Split the string, dynamic-import the
// module, and stash the resolved component on a separate global so
// ReactServerComponent's FlightComponent can read it synchronously in its
// initial useState. Root components never receive props.
//
// Subsequent updates (Refresh / Link navigation / server-function
// responses) still flow through the flight path via setComponent, keeping
// the PAGE_ROOT wrapper the authoritative owner of its children.
if (
  hasPageRootHydration() &&
  typeof self !== "undefined" &&
  typeof self.__react_server_root__ === "string" &&
  typeof self.__react_server_root_component__ !== "function"
) {
  const spec = self.__react_server_root__;
  const hashIndex = spec.indexOf("#");
  const id = hashIndex === -1 ? spec : spec.slice(0, hashIndex);
  const name = hashIndex === -1 ? "default" : spec.slice(hashIndex + 1);
  try {
    // eslint-disable-next-line no-unsanitized/method
    const mod = await import(/* @vite-ignore */ id);
    const Component = mod?.[name] ?? mod?.default;
    if (typeof Component !== "function") {
      throw new Error(`client-root: module "${id}" did not export "${name}"`);
    }
    self.__react_server_root_component__ = Component;
    // Mark PAGE_ROOT as hydrated. The flight-stream path sets this in
    // ClientProvider.getFlightResponse after consuming the inline stream;
    // the client-root path skips that entirely, so we set it here. Test
    // utilities (waitForHydration) and ClientProvider's defer/refresh
    // paths both gate on this marker.
    self[`__flightHydration__${PAGE_ROOT}__`] = true;
  } catch (e) {
    // Log and let the normal path take over — ReactServerComponent's
    // initialClientRootComponent returns null when the component global
    // is missing, so it falls back to getFlightResponse (which will
    // produce its own, more specific, error).
    console.error("[react-server] client-root bootstrap failed:", e);
  }
}

startTransition(() => {
  if (!hasPageRootHydration()) {
    if (hasHydrationIslandHints() || import.meta.env.DEV) {
      self.__react_server_hydrate_islands__?.();
      bootstrapStandaloneDevTools();
    }
    return;
  }

  hydrateRoot(
    self.__react_server_hydration_container__?.() ?? document,
    <StrictMode>
      <ReactServer />
    </StrictMode>,
    {
      onCaughtError(error) {
        // Suppress RedirectError — it's an expected control-flow throw
        // caught by RedirectBoundary, not a real error.
        if (error instanceof RedirectError) return;
        console.error(error);
      },
    }
  );
});
