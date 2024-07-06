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
        error = {
          message,
          stack: stack.join("\n"),
        };
      }
      error.plugin = "@lazarv/react-server";
      const [, ...stacklines] = error.stack.split("\n");
      error.stack = stacklines.map((it) => it.trim()).join("\n");
      const [, id, line, column] = (stacklines?.[0] ?? "").match(
        /\((.*):([0-9]+):([0-9]+)\)/
      );
      error.id = id || source;

      if (!force && error.id.startsWith("http")) {
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
                    `${indent}${curr
                      .toString()
                      .replaceAll(/./g, " ")} |${" ".repeat(
                      error.loc.column
                    )}^`,
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
      document.body.appendChild(overlay);
    }
  };

  const originalConsoleError = console.error;
  console.error = (...args) => {
    showErrorOverlay(format(...args));
    originalConsoleError(...args);
  };

  window.onerror = (message, source, lineno, colno, error) => {
    showErrorOverlay(error, source, lineno, colno, message);
  };
}

startTransition(() => {
  hydrateRoot(
    __react_server_hydration_container__?.() ?? document,
    <StrictMode>
      <ReactServer />
    </StrictMode>
  );
});
