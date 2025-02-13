import { startTransition, StrictMode, Component } from "react";
import { hydrateRoot } from "react-dom/client";

import ClientProvider, {
  PAGE_ROOT,
  ClientContext,
  streamOptions,
} from "./ClientProvider.jsx";
import ReactServerComponent from "./ReactServerComponent.jsx";

self.__react_server_callServer__ = streamOptions(PAGE_ROOT).callServer;

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
    return { didCatch: true, error, info: null };
  }

  componentDidCatch(error, info) {
    for (const [key, value] of this.context.state.cache.entries()) {
      if (findRef(error, value)) {
        this.setState({
          didCatch: true,
          error,
          info,
          outlet: key,
          url: this.context.state.outlets.get(key) || PAGE_ROOT,
        });
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
      this.context.invalidate(outlet, { noEmit: true });
      this.context.getFlightResponse(outlet, {
        outlet,
        remote: outlet !== PAGE_ROOT && self[`__flightStream__${outlet}__`],
        url,
        onFetch: () => {
          this.setState(initialState);
        },
      });
    } else {
      this.setState(initialState);
    }
  };

  render() {
    const { didCatch, error } = this.state;

    if (didCatch) {
      return (
        <html lang="en" suppressHydrationWarning>
          <head>
            <title>{document.title}</title>
            <meta
              name="viewport"
              content="width=device-width, initial-scale=1"
            />
            <meta charSet="utf-8" />
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
            <h1>{error.digest || "Error"}</h1>
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
  var formatRegExp = /%[oOdisfc%]/g;
  const format = (f, ...args) => {
    let i = 0;
    const len = args.length;
    const str = String(f).replace(formatRegExp, function (x) {
      if (x === "%%") return "%";
      if (i >= len) return x;
      switch (x) {
        case "%o":
          return args[i++];
        case "%O":
          try {
            return JSON.stringify(args[i++]);
          } catch (_) {
            return "[Circular]";
          }
        case "%d":
        case "%i":
          return Math.floor(Number(args[i++]));
        case "%s":
          return String(args[i++]);
        case "%f":
          return Number(args[i++]);
        case "%c":
          const style = args[i++];
          if (style) {
            return `<span style="${style}">`;
          }
          return "</span>";
        default:
          return x;
      }
    });
    return str;
  };

  const { ErrorOverlay } = await import("/@vite/client");

  const showErrorOverlay = async (error, source, force) => {
    if (
      localStorage.getItem("react-server:overlay") === "false" ||
      sessionStorage.getItem("react-server:overlay") === "false"
    ) {
      return;
    }

    if (!window.__react_server_error_overlay__) {
      if (typeof error === "string") {
        const [message, ...stack] = error.split("\n");
        if (stack[0]) {
          error = {
            message,
            stack: stack.join("\n"),
          };
        } else {
          error = {
            message,
            stack: "",
            details: stack.slice(1).map((line) => {
              if (!line.startsWith("http")) {
                const el = document.createElement("pre");
                el.textContent = line || " ";
                return el;
              } else {
                const el = document.createElement("a");
                el.href = line;
                el.target = "_blank";
                el.textContent = line;
                return el;
              }
            }),
          };
        }
      }
      error.plugin = "@lazarv/react-server";
      const stacklines = error.stack
        .split("\n")
        .filter((it) => it.trim().startsWith("at "))
        .map((it) => it.trim());
      error.stack = stacklines.join("\n");
      const firstLine = stacklines?.[0] ?? "";
      const [, id, line, column] =
        firstLine.match(/\((.*):([0-9]+):([0-9]+)\)/) ??
        firstLine.match(/(.*):([0-9]+):([0-9]+)/) ??
        [];
      error.id = (id || source)?.replace(/^at\s+/, "");

      if (!force) {
        return setTimeout(() => showErrorOverlay(error, source, true));
      }
      window.__react_server_error_overlay__ = true;

      error.loc = {
        file: id,
        column: parseInt(column, 10),
        line: parseInt(line, 10),
        length: 0,
        lineText: "",
        namespace: "",
        suggestion: "",
      };

      try {
        const sourceFile = await fetch(
          error.id.startsWith("http")
            ? error.id.replace("/@fs/", "/@source/")
            : `/@source${error.id}`
        );
        const sourceCode = await sourceFile.text();

        const lines = sourceCode.split("\n");
        const start = Math.max(0, error.loc.line - 3);
        const end = Math.min(lines.length, error.loc.line + 3);
        const frame = lines
          .slice(start, end)
          .flatMap((l, i) => {
            const curr = i + start;
            const indent = " ".repeat(
              Math.max(start, end).toString().length - curr.toString().length
            );
            return [
              `${indent}${curr} | ${l}`,
              ...(i === 2
                ? [
                    `${indent}${curr.toString().replaceAll(/./g, " ")} |${" ".repeat(error.loc.column)}^`,
                  ]
                : []),
            ];
          })
          .join("\n");
        error.frame = `${error.message}\n${frame}\n`;
      } catch (e) {
        // noop
      }

      const overlay = new ErrorOverlay(error);
      overlay.addEventListener("click", () => {
        window.__react_server_error_overlay__ = false;
      });
      window.addEventListener("keydown", (e) => {
        if (window.__react_server_error_overlay__ && e.key === "Escape") {
          window.__react_server_error_overlay__ = false;
        }
      });
      if (error.details) {
        const el = document.createElement("div");
        el.className = "details";
        const styles = document.createElement("style");
        styles.textContent = `.details {
  color: var(--dim);
  --code-bg: #282828;
  --green: #00ff00;
  --red: #ff0000;
  --white: #fff;
}
.details pre {
  min-height: 1rem;
  margin: 2px 0;
  font-size: 12px;
  white-space: pre-wrap;
}
.details pre span.code {
  color: var(--yellow);
  background: var(--code-bg);
  padding: 4px;
  border-radius: 4px;
}
.details a {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--white);
}
.details code {
  display: block;
  padding: 16px;
  overflow: auto;
  background: var(--code-bg);
  color: var(--white);
  border-radius: 6px 6px 8px 8px;
}
.details code pre {
  margin: 0;
}
.details code .added {
  color: var(--green);
  font-weight: 600;
}
.details code .removed {
  color: var(--red);
  font-weight: 600;
}`;
        let code;
        error.details.forEach((d, di) => {
          const content = d.textContent.trim();
          if (!code && content.startsWith("<")) {
            code = document.createElement("code");
            el.appendChild(code);
          } else if (code && !content) {
            code = null;
          }
          if (code) {
            if (content.startsWith("+")) {
              d.classList.add("added");
            } else if (content.startsWith("-")) {
              d.classList.add("removed");
            }
            code.appendChild(d);
          } else {
            const parts = content.split(/`([^`]+)`/);
            d.innerHTML = "";
            for (let i = 0; i < parts.length; i++) {
              if (i % 2 === 0) {
                const text = parts[i];
                const textParts = text.split(/<([^>]+)>/);

                if (textParts.length > 1) {
                  for (let j = 0; j < textParts.length; j++) {
                    if (j % 2 === 0) {
                      d.appendChild(document.createTextNode(textParts[j]));
                    } else {
                      const codeEl = document.createElement("span");
                      codeEl.className = "code";
                      codeEl.textContent = `<${textParts[j]}>`;
                      d.appendChild(codeEl);
                    }
                  }
                } else {
                  d.appendChild(document.createTextNode(text));
                }
              } else {
                const codeEl = document.createElement("span");
                codeEl.className = "code";
                codeEl.textContent = parts[i];
                d.appendChild(codeEl);
              }
            }

            if (d.textContent.length > 0 || di < error.details.length - 1) {
              el.appendChild(d);
            }
          }
        });
        el.appendChild(styles);
        overlay.shadowRoot
          .querySelector("pre.message")
          .insertAdjacentElement("afterend", el);
      }
      if (/<span style="/.test(error.message)) {
        const messageBody = overlay.shadowRoot.querySelector(".message-body");
        messageBody.style.colorScheme = "dark";
        messageBody.innerHTML = messageBody.textContent;
      }
      document.body.appendChild(overlay);
    }
  };

  class ReactServerErrorIndicator extends HTMLElement {
    constructor(message, callback) {
      super();
      this.message = message;
      this.callback = callback;
      this.root = this.attachShadow({ mode: "closed" });

      const errorToastStyle = document.createElement("style");
      errorToastStyle.textContent = `:host {
  --monospace: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
  --red: #ff5555;
  --white: #fff;
  position: fixed;
  left: 16px;
  bottom: 16px;
  padding: 4px 8px !important;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-family: var(--monospace);
  font-size: 12px;
  color: var(--white);
  box-sizing: border-box;
  padding: 8px 16px;
  background: var(--red);
  border-radius: 6px 6px 8px 8px;
  box-shadow: 0 19px 38px rgba(0, 0, 0, 0.30), 0 15px 12px rgba(0, 0, 0, 0.22);
  overflow: hidden;
  direction: ltr;
  text-align: left;
  transition: border-left 0.2s ease-in-out;
}
:host(:hover) {
  border-left: 8px solid var(--white);
}`;
      this.root.textContent = this.message;
      this.root.appendChild(errorToastStyle);
    }

    connectedCallback() {
      this.addEventListener("click", this.callback);
      const observer = new MutationObserver(() => {
        this.style.display =
          document.querySelector("vite-error-overlay") !== null ? "none" : "";
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }
  customElements.define(
    "react-server-error-indicator",
    ReactServerErrorIndicator
  );

  const errorToast = (message, callback) => {
    let el = document.querySelector("react-server-error-indicator");
    if (el) {
      el.remove();
    }
    el = new ReactServerErrorIndicator(
      `${message.replace(/<span style="[^"]+">.*<\/span>/g, "").slice(0, Math.min(24, message.length))}...`,
      callback
    );
    document.body.appendChild(el);
  };

  const originalConsoleError = console.error;
  console.error = (...args) => {
    const [ctrl, style, server] = args;
    if (
      // check and detect server error proxy message
      typeof ctrl === "string" &&
      !(
        ctrl.startsWith("%c") &&
        style.startsWith("background:") &&
        server?.toLowerCase()?.trim() === "server"
      )
    ) {
      errorToast(format(...args), () => showErrorOverlay(format(...args)));
    }
    originalConsoleError(...args);
  };

  window.onerror = (message, source, lineno, colno, error) => {
    const msg = message.replace(/^Uncaught Error:/, "");
    errorToast(msg, () =>
      showErrorOverlay(
        msg.split("\n").length > 1 ? msg : error,
        source,
        lineno,
        colno
      )
    );
  };

  window.addEventListener("unhandledrejection", (e) => {
    errorToast(e.reason.message, () => showErrorOverlay(e.reason));
  });
}

startTransition(() => {
  hydrateRoot(
    self.__react_server_hydration_container__?.() ?? document,
    <StrictMode>
      <ReactServer />
    </StrictMode>
  );
});
