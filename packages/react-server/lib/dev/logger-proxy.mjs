import { renderToReadableStream } from "@lazarv/rsc/server";

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
        try {
          const stream = renderToReadableStream({
            method,
            args,
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
        } catch {
          // ignore
        }
      };
    }
  });
}
