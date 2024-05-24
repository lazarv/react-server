import { getEnv, immediate } from "@lazarv/react-server/lib/sys.mjs";
import { ssrManifest } from "@lazarv/react-server/server/ssr-manifest.mjs";
import { renderToReadableStream } from "react-dom/server.edge";
import { createFromReadableStream } from "react-server-dom-webpack/client.edge";

export const createRenderer = ({
  moduleCacheStorage,
  parentPort,
  importMap,
}) => {
  const isDevelopment = getEnv("NODE_ENV") !== "production";
  return async ({
    id,
    stream: flight,
    bootstrapModules,
    bootstrapScripts,
    outlet,
    formState,
  }) => {
    let started = false;
    moduleCacheStorage.run(new Map(), async () => {
      try {
        const stream = new ReadableStream({
          type: "bytes",
          async start(controller) {
            try {
              const [renderStream, forwardStream] = flight.tee();

              const decoder = new TextDecoder();
              const encoder = new TextEncoder();

              const tree = await createFromReadableStream(
                renderStream,
                ssrManifest
              );

              const forwardReader = forwardStream.getReader();

              let hydrated = false;
              let hmr = false;
              let hasClientComponent = false;
              let bootstrapped = false;

              const html = await renderToReadableStream(tree, {
                formState,
              });
              const htmlReader = html.getReader();

              let forwardReady = null;
              let htmlReady = null;

              let forwardDone = false;
              let forwardNext = null;
              const forwardWorker = async function* () {
                await htmlReady;

                let done = false;

                const interrupt = new Promise((resolve) =>
                  immediate(() => resolve("interrupt"))
                );

                let _resolve;
                forwardReady = new Promise((resolve) => {
                  _resolve = resolve;
                });

                let force = false;
                while (!done || force) {
                  const read = forwardNext ? forwardNext : forwardReader.read();
                  const res = await Promise.race([read, interrupt]);

                  if (res === "interrupt") {
                    forwardNext = read;
                    done = true;
                    break;
                  }

                  forwardNext = null;

                  const { value, done: _done } = res;
                  forwardDone = _done;

                  hasClientComponent = moduleCacheStorage.getStore()?.size > 0;

                  if (_done) break;

                  if (value) {
                    const lines = decoder.decode(value).split("\n");
                    force = value[value.length - 1] !== 0x0a;

                    if (lines.some((l) => l.startsWith("0:"))) {
                      if (!bootstrapped) {
                        bootstrapScripts.unshift(
                          `self.__flightStream__${outlet}__=new TransformStream();self.__flightWriter__${outlet}__=self.__flightStream__${outlet}__.writable.getWriter();self.__flightEncoder__${outlet}__=new TextEncoder();`
                        );
                        bootstrapped = true;
                      }
                    }

                    const chunk = `self.__flightWriter__${outlet}__.write(self.__flightEncoder__${outlet}__.encode(${JSON.stringify(
                      decoder.decode(value)
                    )}));`;
                    if (hydrated) {
                      const script = encoder.encode(
                        `<script>document.currentScript.parentNode.removeChild(document.currentScript);${chunk}</script>`
                      );
                      yield script;
                    } else {
                      bootstrapScripts.push(chunk);
                    }
                  }

                  if (bootstrapped && !force) {
                    break;
                  }
                }

                _resolve();
              };

              let htmlDone = false;
              let htmlNext = null;
              const htmlWorker = async function* () {
                await forwardReady;

                let done = false;

                const interrupt = new Promise((resolve) =>
                  immediate(() => resolve("interrupt"))
                );

                let _resolve;
                htmlReady = new Promise((resolve) => {
                  _resolve = resolve;
                });

                let force = false;
                let hasNewLine = true;
                while (!done || force) {
                  const read = htmlNext ? htmlNext : htmlReader.read();
                  const res = await Promise.race([read, interrupt]);

                  if (res === "interrupt") {
                    htmlNext = read;
                    done = true;
                    break;
                  }

                  htmlNext = null;

                  const { value, done: _done } = res;
                  htmlDone = _done;

                  if (_done) break;

                  if (value) {
                    hasNewLine = value[value.length - 1] === 0x0a;
                    force = value[value.length - 1] !== 0x3e;

                    yield value;
                    const chunk = decoder.decode(value);
                    if (chunk.endsWith("<!--/$-->")) {
                      done = true;
                    }
                  }
                }

                if (
                  !hydrated &&
                  bootstrapped &&
                  (hasClientComponent || isDevelopment)
                ) {
                  if (hasClientComponent) {
                    // TODO: bootstrapScripts should be buffers instead of strings, fix script parts should be pre-encoded buffers then yield copy of those buffers
                    const script = encoder.encode(
                      `${
                        isDevelopment
                          ? `<script>self.__react_server_hydrate__ = true;</script>`
                          : ""
                      }<script>document.currentScript.parentNode.removeChild(document.currentScript);${bootstrapScripts.join(
                        ""
                      )}</script>${
                        importMap
                          ? `<script type="importmap">${JSON.stringify(
                              importMap
                            )}</script>`
                          : ""
                      }${bootstrapModules
                        .map(
                          (mod) =>
                            `<script type="module" src="${mod}" async></script>`
                        )
                        .join("")}`
                    );
                    yield script;
                    hydrated = true;
                  } else if (!hmr && isDevelopment) {
                    const script = encoder.encode(
                      `${bootstrapModules
                        .map(
                          (mod) =>
                            `<script type="module" src="${mod}" async></script>`
                        )
                        .join("")}`
                    );
                    yield script;
                    hmr = true;
                  }
                }

                _resolve();
              };

              const worker = async function* () {
                while (!(forwardDone && htmlDone)) {
                  for await (const value of forwardWorker()) {
                    yield value;
                  }

                  for await (const value of htmlWorker()) {
                    yield value;
                  }

                  if (!started) {
                    started = true;
                    parentPort.postMessage({ id, start: true });
                  }
                }
              };

              const render = async () => {
                for await (const value of worker()) {
                  controller.enqueue(value);
                }

                controller.close();
                parentPort.postMessage({ id, done: true });
              };

              render();
            } catch (error) {
              parentPort.postMessage({
                id,
                error: error.message,
                stack: error.stack,
              });
            }
          },
        });

        parentPort.postMessage({ id, stream }, [stream]);
      } catch (error) {
        parentPort.postMessage({
          id,
          error: error.message,
          stack: error.stack,
        });
      }
    });
  };
};
