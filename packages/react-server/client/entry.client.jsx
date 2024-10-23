import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";

import ClientProvider, { PAGE_ROOT, streamOptions } from "./ClientProvider.jsx";
import ReactServerComponent from "./ReactServerComponent.jsx";

self.__react_server_callServer__ = streamOptions(PAGE_ROOT).callServer;

function ReactServer() {
  return (
    <ClientProvider>
      <ReactServerComponent outlet={PAGE_ROOT} url={location.href} />
    </ClientProvider>
  );
}

if (import.meta.env.DEV) {
  var formatRegExp = /%[sdj%]/g;
  const format = (f, ...args) => {
    let i = 0;
    const len = args.length;
    const str = String(f).replace(formatRegExp, function (x) {
      if (x === "%%") return "%";
      if (i >= len) return x;
      switch (x) {
        case "%s":
          return String(args[i++]);
        case "%d":
          return Number(args[i++]);
        case "%j":
          try {
            return JSON.stringify(args[i++]);
          } catch (_) {
            return "[Circular]";
          }
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
        error.details.forEach((d) => {
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
            if (parts.length > 1) {
              d.innerHTML = "";
              for (let i = 0; i < parts.length; i++) {
                if (i % 2 === 0) {
                  // Text outside of backticks
                  d.appendChild(document.createTextNode(parts[i]));
                } else {
                  // Code inside backticks
                  const codeEl = document.createElement("span");
                  codeEl.className = "code";
                  codeEl.textContent = parts[i];
                  d.appendChild(codeEl);
                }
              }
            }
            el.appendChild(d);
          }
        });
        el.appendChild(styles);
        overlay.shadowRoot
          .querySelector("pre.message")
          .insertAdjacentElement("afterend", el);
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
      `${message.slice(0, Math.min(24, message.length))}...`,
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
}

startTransition(() => {
  hydrateRoot(
    self.__react_server_hydration_container__?.() ?? document,
    <StrictMode>
      <ReactServer />
    </StrictMode>
  );
});
