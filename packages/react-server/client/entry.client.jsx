import { startTransition, StrictMode, Component } from "react";
import { hydrateRoot } from "react-dom/client";

import ClientProvider, {
  PAGE_ROOT,
  ClientContext,
  streamOptions,
} from "./ClientProvider.jsx";
import ReactServerComponent from "./ReactServerComponent.jsx";

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

if (import.meta.env.DEV) {
  if (
    document
      .querySelector(`meta[name="react-server:overlay"]`)
      ?.getAttribute("content") !== "false"
  ) {
    await import("./error-overlay.mjs");
  }
}

startTransition(() => {
  hydrateRoot(
    self.__react_server_hydration_container__?.() ?? document,
    <StrictMode>
      <ReactServer />
    </StrictMode>
  );
});
