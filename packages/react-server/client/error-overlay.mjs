import React from "react";

import { ErrorOverlay } from "/@vite/client";

import { highlightXmlDiff, hljs } from "./highlight.mjs";

const formatRegExp = /%[oOjdisfc%]/g;
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
        } catch {
          return "[Circular]";
        }
      case "%d":
      case "%i":
        return Math.floor(Number(args[i++]));
      case "%s":
        return String(args[i++]);
      case "%f":
        return Number(args[i++]);
      case "%c": {
        const style = args[i++];
        if (style) {
          return `<span style="${style}">`;
        }
        return "</span>";
      }
      default:
        return x;
    }
  });
  return str;
};

const argToPre = (arg) => {
  const el = document.createElement("pre");
  if (typeof arg === "string") {
    el.textContent = arg;
  } else if (typeof arg === "object") {
    el.innerHTML = `<code class="hljs">${
      hljs.highlight(JSON.stringify(arg, null, 2), {
        language: "json",
      }).value
    }</code>`;
  }
  return el;
};

export const showErrorOverlay = async (error, source, force, type, args) => {
  if (
    localStorage.getItem("react-server:overlay") === "false" ||
    sessionStorage.getItem("react-server:overlay") === "false"
  ) {
    return;
  }

  if (!window.__react_server_error_overlay__) {
    if (typeof error === "string") {
      const [message, ...stack] = error.split("\n");
      if (stack[0]?.trim().startsWith("at ")) {
        error = {
          message,
          stack: stack.join("\n"),
          details: args ? args.map((arg) => argToPre(arg)) : undefined,
        };
      } else {
        error = {
          message,
          stack: "",
          details: [
            ...(stack.length > 0
              ? (stack[0].trim() === "" ? stack.slice(1) : stack).map(
                  (line) => {
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
                  }
                )
              : []),
            ...(args ? args.map((arg) => argToPre(arg)) : []),
          ],
        };
      }
    }
    error.plugin = "@lazarv/react-server";
    const cwd =
      document
        .querySelector(`meta[name="react-server:cwd"]`)
        ?.getAttribute("content") || null;
    const stacklines = error.stack
      .split("\n")
      .filter((it) => it.trim().startsWith("at "))
      .map((it) =>
        it
          .trim()
          .replace(location.origin, it.includes(cwd) ? "" : cwd)
          .replace("/@fs", "")
          .replace(/\?v=[a-z0-9]+/, "")
      );
    error.stack = stacklines.join("\n");
    const firstLine = stacklines?.[0] ?? "";
    const [, id, line, column] =
      firstLine.match(/\((.*):([0-9]+):([0-9]+)\)/) ??
      firstLine.match(/(.*):([0-9]+):([0-9]+)/) ??
      [];
    error.id = (id || source)?.replace(/^at\s+/, "");

    if (!force) {
      return setTimeout(() =>
        showErrorOverlay(error, source, true, type, args)
      );
    }
    window.__react_server_error_overlay__ = true;

    if (id && line && column) {
      error.loc = {
        file: id,
        line: parseInt(line, 10),
        column: parseInt(column, 10),
        length: 0,
        lineText: "",
        namespace: "",
        suggestion: "",
      };
    }

    if (error.id) {
      try {
        const sourceFile = await fetch(error.id.replace(/^file:\/\//, "/@fs"));
        error.id = error.id.replace(/^file:\/\//, "");
        error.loc.file = error.id;
        let code = await sourceFile.text();
        const SOURCEMAPPING_URL_RE = /^\/\/# sourceMappingURL=(.*)/m;
        const sourceMappingURL = code.match(SOURCEMAPPING_URL_RE)?.[1];
        if (sourceMappingURL) {
          const rawSourceMap = sourceMappingURL.includes("base64,")
            ? JSON.parse(
                atob(sourceMappingURL.split("data:application/json;base64,")[1])
              )
            : await fetch(new URL(sourceMappingURL, new URL(error.id))).then(
                (res) => res.json()
              );
          if (!error.plugin) {
            const { TraceMap, originalPositionFor } = await import(
              "@jridgewell/trace-mapping"
            );
            const traced = new TraceMap(rawSourceMap);
            const pos = originalPositionFor(traced, {
              line: Number(error.loc.line),
              column: Number(error.loc.column),
            });
            if (pos.source) {
              error.loc.file = pos.source;
              error.loc.line = pos.line + 1;
              error.loc.column = pos.column + 1;
              error.loc.length = 0;
              error.loc.lineText = code.split("\n")[pos.line] || "";
              error.loc.namespace = "";
              error.loc.suggestion = "";
            }
          }
          const originalCode = code;
          code = rawSourceMap.sourcesContent[0];
          error.code =
            code.split("\n").length > error.loc.line
              ? code
              : originalCode
                  .replace(SOURCEMAPPING_URL_RE, "")
                  .split("\n")
                  .slice(0, -1)
                  .join("\n");
        }
      } catch (e) {
        console.error(e);
        // noop
      }
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
    if (!error.details && error.digest && error.digest !== error.message) {
      error.details = error.digest.split("\n").map((line) => {
        const el = document.createElement("pre");
        el.textContent = line || " ";
        return el;
      });
    }

    if (error.details || error.code) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      const { default: href } = await import(
        "react-server-highlight.js/styles/github-dark.css?url"
      );
      link.href = href;
      overlay.shadowRoot.appendChild(link);
    }

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
  margin-bottom: 1em;
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
  margin: 1rem 0;
}
.details pre:empty + pre code {
  margin-top: 0;
}
.details pre:last-of-type code {
  margin-bottom: 0;
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
      let codeContent = [];
      error.details.forEach((d, di) => {
        const content = d.textContent.trim();

        if (d.firstChild && d.firstChild.tagName === "CODE") {
          el.appendChild(d);
          return;
        } else if (!code && /^(<|```)/.test(content)) {
          code = document.createElement("pre");
          el.appendChild(code);
        } else if (code && !content) {
          code.innerHTML = `<code class="hljs">${highlightXmlDiff(
            codeContent.join("\n")
          )}</code>`;
          code = null;
          codeContent = [];
        }
        if (code) {
          codeContent.push(d.textContent);
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

    if (type === "warn") {
      const style = document.createElement("style");
      style.textContent = `:host .message-body {
  color: var(--yellow);
}`;
      overlay.shadowRoot.appendChild(style);
    }

    const frame = overlay.shadowRoot.querySelector(".frame");
    if (error.code) {
      const style = document.createElement("style");
      style.textContent = `:host .frame {
  position: relative;
  max-height: 25vh;
  overflow-y: auto;
}
:host .frame .line-highlight {
  position: absolute;
  left: 0;
  right: 0;
  height: 19.5px;
  background: var(--yellow);
  opacity: 0.3;
  pointer-events: none;
  top: calc(var(--line) * 19.5px);
  margin-top: -6.5px;
}`;
      overlay.shadowRoot.appendChild(style);

      const highlightedCode = `<code class="hljs">${
        hljs.highlight(error.code, {
          language: "javascript",
        }).value
      }${error.code.split("\n").length > error.loc.line ? `<div class="line-highlight" style="--line:${error.loc.line}"></div>` : ""}</code>`;
      frame.innerHTML = highlightedCode;
    }

    document.body.appendChild(overlay);

    if (error.code) {
      const highlightedLine = frame.querySelector(".line-highlight");
      frame.scrollTop = Math.max(
        0,
        highlightedLine.offsetTop -
          frame.clientHeight / 2 -
          highlightedLine.clientHeight / 2
      );
    }
  }
};

const displayType = {
  error: "Error",
  warn: "Warning",
  info: "Info",
  debug: "Debug",
};
class ReactServerErrorIndicator extends HTMLElement {
  constructor(message, type, callback) {
    super();
    this.message = message;
    this.callback = callback;
    this.root = this.attachShadow({ mode: "closed" });

    const errorToastStyle = document.createElement("style");
    errorToastStyle.textContent = `:host {
  --monospace: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
  --red: #ff5555;
  --yellow: #e2aa53;
  --white: #fff;
  --black: #181818;
  --shadow: 0 19px 38px rgba(0, 0, 0, 0.30), 0 15px 12px rgba(0, 0, 0, 0.22);
  position: fixed;
  left: 16px;
  bottom: calc(16px + (var(--count) - var(--i)) * 32px);
  padding: 4px 32px 4px 8px !important;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: start;
  cursor: pointer;
  font-family: var(--monospace);
  font-size: 12px;
  color: var(--red);
  box-sizing: border-box;
  padding: 8px 16px;
  background: var(--black);
  border-radius: 6px 6px 8px 8px;
  box-shadow: var(--shadow);
  border-left: 8px solid var(--red);
  direction: ltr;
  text-align: left;
  opacity: 0.5;
  transition: opacity 0.3s ease-in-out, transform 0.3s ease-in-out, bottom 0.1s ease-in-out;
  animation: slideIn 0.3s ease-in-out;
}
:host(:nth-of-type(n+7)) {
  display: none;
}
:host(:nth-of-type(6)) {
  padding-right: 8px !important;
  border-left: 8px solid var(--white) !important;
  color: var(--white) !important;
  pointer-events: none;
  opacity: 1;
}
:host(:nth-of-type(6)):before {
  content: var(--more) " more items";
}
:host(:nth-of-type(6)) .actions,
:host(:nth-of-type(6)) .message {
  display: none;
}
.message {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  max-width: calc(min(100vw - 84px, 320px));
  transition: max-width 0.3s ease-in-out;
  transition-delay: 0.3s;
}
.message:hover {
  max-width: calc(100vw - 84px);
}
.clear-all {
  margin-left: 8px;
  padding: 0 16px !important;
  box-shadow: var(--shadow);
  width: min-content;
  white-space: nowrap;
  font-size: 12px !important;
  opacity: 0;
  transform: translateY(100%);
  transition: opacity 0.3s ease-in-out, transform 0.3s ease-in-out;
}
:host(.warn) {
  border-left-color: var(--yellow);
  color: var(--yellow);
}
:host(.dismissed) {
  opacity: 0;
  transform: translateX(-100vw);
}
:host(:hover) {
  opacity: 1;
}
:host .actions {
  position: absolute;
  left: 100%;
  height: 100%;
  margin-left: -25px;
  display: flex;
  align-items: center;
  justify-content: center;
}
:host button {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--white);
  border: none;
  border-radius: 6px 6px 8px 8px;
  color: var(--red);
  font-size: 16px;
  cursor: pointer;
  padding: 0 8px;
  line-height: 1;
  font-size: 14px;
}
:host .actions:hover .clear-all {
  opacity: 1;
  transform: translateY(0);
}
:host button:hover {
  background: var(--red);
  color: var(--white);
}
@media (prefers-reduced-motion: reduce) {
  :host, * {
    transition: none !important;
  }
}
@keyframes slideIn {
  from {
    transform: translateX(-100vw);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 0.8;
  }
}`;
    const content = document.createElement("div");
    content.className = "message";
    content.textContent = `${this.message || (displayType[type] ?? type)}`;
    this.root.appendChild(content);
    this.root.appendChild(errorToastStyle);

    const actions = document.createElement("div");
    actions.className = "actions";

    const dismissButton = document.createElement("button");
    dismissButton.className = "dismiss";
    dismissButton.textContent = "✖";
    dismissButton.type = "button";
    dismissButton.addEventListener("click", (e) => {
      e.stopPropagation();
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        this.remove();
        return;
      }
      this.className += " dismissed";
      this.addEventListener(
        "transitionend",
        () => {
          this.remove();
        },
        { once: true }
      );
    });
    actions.appendChild(dismissButton);

    const clearAllButton = document.createElement("button");
    clearAllButton.className = "clear-all";
    clearAllButton.textContent = "✖ Clear All";
    clearAllButton.type = "button";
    clearAllButton.addEventListener("click", (e) => {
      e.stopPropagation();
      const withTransition = !matchMedia("(prefers-reduced-motion: reduce)")
        .matches;
      document
        .querySelectorAll("react-server-error-indicator:nth-of-type(-n+5)")
        .forEach((el) => {
          if (!withTransition || Number(el.style.getPropertyValue("--i")) > 5) {
            el.remove();
            return;
          }
          el.className += " dismissed";
          el.addEventListener(
            "transitionend",
            () => {
              el.remove();
            },
            { once: true }
          );
        });
    });
    actions.appendChild(clearAllButton);

    this.root.appendChild(actions);

    this.className = type;
  }

  updateIndex() {
    try {
      const parent = this.parentElement;
      const all = Array.from(parent.children).filter(
        (el) => el.tagName.toLowerCase() === this.tagName.toLowerCase()
      );
      const count = all.length;
      const index = all.indexOf(this) + 1;

      this.style.setProperty("--count", Math.min(6, count));
      this.style.setProperty("--total-count", count);
      this.style.setProperty("--i", index);
      this.style.setProperty("--more", `"+${count - 5}"`);
      if (index === 1) {
        if (count > 6) {
          this.classList.add("show-more");
        } else {
          this.classList.remove("show-more");
        }
      }
    } catch {
      // ignore
    }
  }

  connectedCallback() {
    this.addEventListener("click", this.callback);

    const observer = new MutationObserver(() => {
      if (document.querySelector("vite-error-overlay") !== null) {
        this.classList.add("dismissed");
      } else {
        this.classList.remove("dismissed");
      }

      this.updateIndex();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    this.updateIndex();
  }
}

customElements.define(
  "react-server-error-indicator",
  ReactServerErrorIndicator
);

const errorToast = (message, type = "error", callback) => {
  const el = new ReactServerErrorIndicator(message, type, callback);
  document.body.appendChild(el);
};

if (
  document
    .querySelector("meta[name='react-server:console']")
    ?.getAttribute("content") !== "false"
) {
  const loggerMethods = [
    "debug",
    "dir",
    "error",
    "info",
    "log",
    "table",
    "time",
    "timeEnd",
    "timeLog",
    "trace",
    "warn",
  ];
  Object.keys(console).forEach((method) => {
    if (
      typeof console[method] === "function" &&
      loggerMethods.includes(method)
    ) {
      const originalMethod = console[method].bind(console);
      console[method] = (...args) => {
        const result = originalMethod(...args);
        const [maybeFormat, maybeStyle, maybeEnv] = args;
        if (
          maybeFormat.startsWith("%c") &&
          maybeStyle.startsWith("background:") &&
          maybeEnv?.toLowerCase()?.trim() === "server"
        ) {
          return result;
        }
        try {
          React.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE =
            {
              A: null,
              TaintRegistryPendingRequests: new Set(),
              TaintRegistryObjects: new Map(),
              TaintRegistryValues: new Map(),
              TaintRegistryByteLengths: new Map(),
            };
          import("react-server-dom-webpack/server.browser").then(
            ({ renderToReadableStream }) => {
              delete React.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
              const cwd =
                document
                  .querySelector(`meta[name="react-server:cwd"]`)
                  ?.getAttribute("content") || null;
              const normalizedArgs = args.map((arg) => {
                if (arg instanceof Error) {
                  const stacklines =
                    arg.stack
                      ?.split("\n")
                      .filter((it) => it.trim().startsWith("at "))
                      .map((it) =>
                        it
                          .trim()
                          .replace(location.origin, it.includes(cwd) ? "" : cwd)
                          .replace("/@fs", "")
                          .replace(/\?v=[a-z0-9]+/, "")
                      ) ?? [];
                  arg.stack = stacklines.join("\n");
                }
                return arg;
              });

              const stream = renderToReadableStream({
                method,
                args: normalizedArgs,
              });
              (async () => {
                let data = "";

                const decoder = new TextDecoder("utf-8");
                for await (const chunk of stream) {
                  data += decoder.decode(chunk);
                }
                try {
                  if (import.meta.hot && import.meta.hot.isConnected) {
                    import.meta.hot.send("react-server:console", data);
                  } else {
                    const blob = new Blob([data], {
                      type: "text/x-component",
                    });
                    navigator.sendBeacon("/__react_server_console__", blob);
                  }
                } catch {
                  // ignore
                }
              })();
            }
          );
        } catch {
          // ignore
        }
        return result;
      };
    }
  });
}

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
    errorToast(format(...args), "error", () =>
      showErrorOverlay(
        args.find((arg) => arg instanceof Error) || format(...args),
        null,
        false
      )
    );
  }
  return originalConsoleError(...args);
};

const originalConsoleWarn = console.warn;
console.warn = (...args) => {
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
    errorToast(format(...args), "warn", () =>
      showErrorOverlay(
        args.find((arg) => arg instanceof Error) || format(...args),
        null,
        false,
        "warn",
        args.slice(1)
      )
    );
  } else {
    errorToast("", "warn", () => {
      showErrorOverlay("", null, false, "warn", args);
    });
  }
  return originalConsoleWarn(...args);
};

window.onerror = (message, source, lineno, colno, error) => {
  const msg = message.replace(/^Uncaught Error:/, "");
  errorToast(msg, "error", () =>
    showErrorOverlay(msg.split("\n").length > 1 ? msg : error, source, false)
  );
};

window.addEventListener("unhandledrejection", (e) => {
  errorToast(e.reason.message, "error", () =>
    showErrorOverlay(e.reason, null, false)
  );
});
