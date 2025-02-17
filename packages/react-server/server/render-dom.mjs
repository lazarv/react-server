import { renderToReadableStream, resume } from "react-dom/server.edge";
import { prerender } from "react-dom/static.edge";
import { createFromReadableStream } from "react-server-dom-webpack/client.edge";

import { HttpContextStorage } from "@lazarv/react-server/http-context";
import { getEnv, immediate } from "@lazarv/react-server/lib/sys.mjs";
import { ssrManifest } from "@lazarv/react-server/server/ssr-manifest.mjs";
import { Parser } from "parse5";

import dom2flight from "./dom-flight.mjs";

const streamMap = new Map();
const preludeMap = new Map();

function detectSplitUTF8(chunk) {
  const bytes = new Uint8Array(chunk);
  let cutIndex = bytes.length;

  // Scan from end to find an incomplete character
  for (let i = bytes.length - 1; i >= 0; i--) {
    if ((bytes[i] & 0b11000000) === 0b10000000) {
      // This is a continuation byte, move backward
      continue;
    } else if ((bytes[i] & 0b11100000) === 0b11000000 && bytes.length - i < 2) {
      cutIndex = i; // Incomplete 2-byte character
      break;
    } else if ((bytes[i] & 0b11110000) === 0b11100000 && bytes.length - i < 3) {
      cutIndex = i; // Incomplete 3-byte character
      break;
    } else if ((bytes[i] & 0b11111000) === 0b11110000 && bytes.length - i < 4) {
      cutIndex = i; // Incomplete 4-byte character
      break;
    } else {
      // Found a complete character, stop checking
      break;
    }
  }

  return cutIndex < bytes.length ? bytes.slice(cutIndex) : null;
}

export const createRenderer = ({
  moduleCacheStorage,
  linkQueueStorage,
  parentPort,
}) => {
  const isDevelopment = getEnv("NODE_ENV") !== "production";
  return async ({
    id,
    stream: flight,
    chunk,
    done,
    bootstrapModules,
    bootstrapScripts,
    outlet,
    formState,
    isPrerender,
    prelude,
    preludeChunk,
    preludeDone,
    postponed,
    remote,
    origin,
    importMap,
    defer,
    httpContext,
  }) => {
    if (!flight && !streamMap.has(id)) {
      flight = new ReadableStream({
        type: "bytes",
        async start(controller) {
          streamMap.set(id, controller);
        },
      });
    }

    if (chunk || done) {
      const controller = streamMap.get(id);
      if (controller) {
        if (chunk) {
          controller.enqueue(chunk);
        } else if (done) {
          streamMap.delete(id);
          controller.close();
        }
      }
      return;
    }

    if (prelude === "chunk" && !preludeMap.has(id)) {
      prelude = new ReadableStream({
        type: "bytes",
        async start(controller) {
          preludeMap.set(id, controller);
        },
      });
    }

    if (preludeChunk || preludeDone) {
      const controller = preludeMap.get(id);
      if (controller) {
        if (preludeChunk) {
          controller.enqueue(preludeChunk);
        } else if (preludeDone) {
          preludeMap.delete(id);
          controller.close();
        }
      }
      return;
    }

    if (!flight) {
      throw new Error("No flight stream provided.");
    }

    let started = false;
    let error = null;
    moduleCacheStorage.run(new Map(), async () => {
      const linkQueue = new Set();
      linkQueueStorage.run(linkQueue, async () => {
        HttpContextStorage.run(
          {
            ...httpContext,
            request: {
              ...httpContext.request,
              headers: Object.entries(httpContext.request.headers).reduce(
                (headers, [key, value]) => {
                  headers.append(key, value);
                  return headers;
                },
                new Headers()
              ),
            },
            url: new URL(httpContext.url),
          },
          async () => {
            try {
              const stream = new ReadableStream({
                type: "bytes",
                async start(controller) {
                  try {
                    const [renderStream, forwardStream] = flight.tee();

                    const decoder = new TextDecoder("utf-8");
                    const encoder = new TextEncoder();

                    const tree = await createFromReadableStream(
                      renderStream,
                      ssrManifest
                    );

                    const forwardReader = forwardStream.getReader();

                    let hydrated = false;
                    let hmr = false;
                    let hasClientComponent = false;
                    let hasServerAction = false;
                    let bootstrapped = false;
                    const linkSent = new Set();

                    let html;

                    if (isPrerender) {
                      const { postponed, prelude } = await prerender(tree, {
                        formState,
                      });
                      html = prelude;
                      if (postponed) {
                        parentPort.postMessage({
                          id,
                          postponed,
                        });
                      } else {
                        isPrerender = false;
                      }
                    } else if (postponed) {
                      if (prelude) {
                        for await (const chunk of prelude) {
                          controller.enqueue(chunk);
                        }
                      }
                      html = await resume(tree, postponed, {
                        formState,
                        onError(e) {
                          error = e;
                        },
                      });
                    } else {
                      html = await renderToReadableStream(tree, {
                        formState,
                        onError(e) {
                          error = e;
                        },
                      });
                    }

                    const htmlReader = html.getReader();

                    let forwardReady = null;
                    let htmlReady = null;

                    let forwardDone = false;
                    let forwardNext = null;
                    let splitBuffer = new Uint8Array(0);
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
                        const read = forwardNext
                          ? forwardNext
                          : forwardReader.read();
                        const res = await Promise.race([read, interrupt]);

                        if (res === "interrupt") {
                          forwardNext = read;
                          done = true;
                          break;
                        }

                        forwardNext = null;

                        const { value: _value, done: _done } = res;
                        forwardDone = _done;

                        hasClientComponent =
                          moduleCacheStorage.getStore()?.size > 0;

                        if (_done) break;

                        if (_value) {
                          let value = _value;
                          if (splitBuffer.byteLength > 0) {
                            const merged = new Uint8Array(
                              splitBuffer.byteLength + value.byteLength
                            );
                            merged.set(splitBuffer, 0);
                            merged.set(value, splitBuffer.byteLength);
                            value = merged;
                          }

                          const splitBytes = detectSplitUTF8(value);
                          if (splitBytes) {
                            splitBuffer = splitBytes;
                            value = value.slice(0, -splitBytes.byteLength);
                          } else {
                            splitBuffer = new Uint8Array(0);
                          }

                          const payload = decoder.decode(value, {
                            stream: true,
                          });
                          const lines = payload.split("\n");
                          if (remote && !hasServerAction) {
                            hasServerAction ||= lines.some((r) =>
                              /^(.+):\{"id":"/.test(r)
                            );
                          }
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
                            payload
                          )}));`;
                          if (hydrated && !remote) {
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
                    let firstChunk = true;
                    let hydrationContainer = "document";
                    let contentLength = 0;
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
                          contentLength += value.length;
                          force = value[value.length - 1] !== 0x3e;
                          const chunk = decoder.decode(value);
                          if (firstChunk) {
                            firstChunk = false;
                            if (!chunk.includes("<html")) {
                              hydrationContainer = "document.body";
                            }
                          }

                          yield value;

                          if (chunk.endsWith("<!--/$-->")) {
                            done = true;
                          }
                        }
                      }

                      if (
                        !isPrerender &&
                        !hydrated &&
                        bootstrapped &&
                        (hasClientComponent || isDevelopment) &&
                        !remote
                      ) {
                        if (hasClientComponent) {
                          if (contentLength === 0) {
                            hydrationContainer = "document.body";
                          }

                          // TODO: bootstrapScripts should be buffers instead of strings, fix script parts should be pre-encoded buffers then yield copy of those buffers
                          const script = encoder.encode(
                            `<script>${isDevelopment ? "self.__react_server_hydrate__=true;" : ""}self.__react_server_hydration_container__=()=>${hydrationContainer};document.currentScript.parentNode.removeChild(document.currentScript);${bootstrapScripts.join(
                              ""
                            )}</script>${
                              hmr
                                ? "<script>self.__react_server_hydrate_init__?.();</script>"
                                : bootstrapModules
                                    .map(
                                      (mod) =>
                                        `<script type="module" src="${mod}" async></script>`
                                    )
                                    .join("")
                            }`
                          );
                          yield script;
                          hydrated = true;
                        } else if (
                          !hmr &&
                          isDevelopment &&
                          contentLength > 0 &&
                          bootstrapModules.length > 0
                        ) {
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

                    let process;
                    const passThrough = (value) => value;

                    const importMapScript = `<script type="importmap">${JSON.stringify(importMap)}</script>`;
                    const injectImportMap = (value) => {
                      const chunk = decoder.decode(value);
                      if (chunk.includes("<head")) {
                        process = passThrough;
                        return encoder.encode(
                          chunk.replace(
                            /<head([^<>]*)>/,
                            `<head$1>${importMapScript}`
                          )
                        );
                      } else if (chunk.startsWith("<!DOCTYPE")) {
                        return value;
                      } else {
                        process = passThrough;
                        return encoder.encode(importMapScript + chunk);
                      }
                    };

                    process =
                      typeof importMap === "object" && importMap !== null
                        ? injectImportMap
                        : passThrough;

                    const worker = async function* () {
                      while (!(forwardDone && htmlDone)) {
                        for await (const value of forwardWorker()) {
                          if (!isPrerender) {
                            yield value;
                          }
                        }

                        for await (const value of htmlWorker()) {
                          yield process(value);
                        }

                        if (linkQueue.size > 0) {
                          const links = Array.from(linkQueue);
                          linkQueue.clear();
                          for (const link of links) {
                            if (!linkSent.has(link)) {
                              linkSent.add(link);
                              yield encoder.encode(
                                `<link rel="stylesheet" href="${link}" />`
                              );
                            }
                          }
                        }

                        if (!started) {
                          started = true;
                          parentPort.postMessage({
                            id,
                            start: true,
                            error: error?.message,
                            stack: error?.stack,
                            digest: error?.digest,
                          });
                        }
                      }
                    };

                    const remoteWorker = async function* () {
                      let line = 1;
                      let tokenize = true;
                      while (!(forwardDone && htmlDone)) {
                        for await (const value of forwardWorker()) {
                          if (hydrated) {
                            yield encoder.encode(
                              `<script>document.currentScript.parentNode.removeChild(document.currentScript);${decoder.decode(
                                value
                              )}</script>`
                            );
                          }
                        }

                        const parser = Parser.getFragmentParser();
                        for await (const value of htmlWorker()) {
                          if (tokenize) {
                            const html = decoder.decode(value);
                            parser.tokenizer.write(html);
                          }
                        }
                        tokenize = false;

                        if (linkQueue.size > 0) {
                          const links = Array.from(linkQueue);
                          linkQueue.clear();
                          for (const link of links) {
                            if (!linkSent.has(link)) {
                              linkSent.add(link);
                              parser.tokenizer.write(
                                `<link rel="stylesheet" href="${link}" />`
                              );
                            }
                          }
                        }

                        if (!defer && (hasClientComponent || hasServerAction)) {
                          while (bootstrapScripts.length > 0) {
                            const textContent = bootstrapScripts.shift();
                            parser.tokenizer.write(
                              `<script>${textContent}</script>`
                            );
                          }
                        }

                        const fragment = parser.getFragment();
                        if (fragment.childNodes.length > 0) {
                          const tree = dom2flight(fragment, { origin, defer });
                          yield encoder.encode(
                            `${line++}:${JSON.stringify(tree)}\n`
                          );
                        }

                        if (!started) {
                          started = true;
                          parentPort.postMessage({
                            id,
                            start: true,
                            error: error?.message,
                            stack: error?.stack,
                            digest: error?.digest,
                          });
                        }
                      }

                      yield encoder.encode(
                        `0:[${new Array(line - 1)
                          .fill(0)
                          .map((_, i) => `"$${i + 1}"`)
                          .join(",")}]\n`
                      );
                    };

                    const render = async () => {
                      try {
                        const iterator = remote ? remoteWorker() : worker();
                        for await (const value of iterator) {
                          controller.enqueue(value);
                        }

                        controller.close();
                        parentPort.postMessage({ id, done: true });
                      } catch (e) {
                        parentPort.postMessage({
                          id,
                          done: true,
                          error: e.message,
                          stack: e.stack,
                          digest: e.digest,
                        });
                      }
                    };

                    render();
                  } catch (error) {
                    parentPort.postMessage({
                      id,
                      done: true,
                      error: error.message,
                      stack: error.stack,
                      digest: error.digest,
                    });
                  }
                },
              });

              try {
                parentPort.postMessage({ id, stream }, [stream]);
              } catch {
                // Send the stream data back via the parent port
                parentPort.postMessage({ id, stream: true });
                (async () => {
                  const reader = stream.getReader();
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                      break;
                    }
                    parentPort.postMessage({ id, stream: true, value });
                  }
                })();
              }
            } catch (error) {
              parentPort.postMessage({
                id,
                done: true,
                error: error.message,
                stack: error.stack,
                digest: error.digest,
              });
            }
          }
        );
      });
    });
  };
};
