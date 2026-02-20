export function createLoggerProxy(parentPort) {
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
        import("react").then(({ default: React }) => {
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
                const normalizedArgs = args.map((arg) => {
                  if (arg instanceof Error) {
                    const stacklines = arg.stack
                      .split("\n")
                      .filter((it) => it.trim().startsWith("at "))
                      .map((it) =>
                        it
                          .trim()
                          .replace("/@fs", "")
                          .replace(/\?v=[a-z0-9]+/, "")
                      );
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
                    parentPort.postMessage({
                      type: "react-server:console",
                      data,
                    });
                  } catch (e) {
                    console.error("Failed to post message to parent port:", e);
                    originalMethod(...args);
                  }
                })();
              }
            );
          } catch {
            // ignore
          }
        });
      };
    }
  });
}
