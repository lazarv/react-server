"use client";

import {
  greet,
  parsedNumber,
  tooShort,
  upload,
  bareEcho,
  readSideEffect,
  resetSideEffect,
  echoArrayBuffer,
  echoTypedArray,
  echoMap,
  echoSet,
  echoStream,
  echoAsyncIterable,
  echoIterable,
  echoPromise,
} from "./server-function-validation-actions.mjs";

/**
 * Driver for the createFunction validation E2E test. Each button
 * invokes one server function with a specific input, stashes the result
 * (or the error message) on `window.__react_server_result__`, and the
 * Playwright spec asserts on the captured shape. We carry the error
 * message text over rather than the original Error object because the
 * client side only sees a transport-stripped error from the runtime.
 */
export default function ServerFunctionValidationClient() {
  const call = (name, run) => (
    <button
      key={name}
      data-testid={name}
      onClick={async () => {
        window.__react_server_result__ = undefined;
        try {
          const r = await run();
          window.__react_server_result__ = r;
        } catch (e) {
          window.__react_server_result__ = {
            kind: "clientError",
            message: String(e?.message ?? e),
          };
        }
      }}
    >
      {name}
    </button>
  );

  return (
    <>
      {/* dev-mode double render */}
      <div suppressHydrationWarning>{Math.random()}</div>

      {call("v-greet-ok", () => greet("alice", 30))}
      {call("v-greet-bad-arg-0", () => greet(123, 30))}
      {call("v-greet-bad-arg-1", () => greet("alice", "thirty"))}

      {call("v-parsed-number-ok", () => parsedNumber("42"))}
      {call("v-parsed-number-bad", () => parsedNumber("not-a-number"))}

      {call("v-too-short", () => tooShort("hi"))}
      {call("v-too-short-side-effect", async () => readSideEffect())}
      {call("v-reset-side-effect", async () => resetSideEffect())}

      {call("v-upload-ok", async () => {
        const fd = new FormData();
        fd.append("title", "hello");
        fd.append(
          "photo",
          new File([new Uint8Array(16)], "p.png", { type: "image/png" })
        );
        return upload(fd);
      })}
      {call("v-upload-oversize", async () => {
        const fd = new FormData();
        fd.append("title", "hello");
        fd.append(
          "photo",
          new File([new Uint8Array(128)], "p.png", { type: "image/png" })
        );
        return upload(fd);
      })}
      {call("v-upload-bad-mime", async () => {
        const fd = new FormData();
        fd.append("title", "hello");
        fd.append(
          "photo",
          new File([new Uint8Array(8)], "p.gif", { type: "image/gif" })
        );
        return upload(fd);
      })}
      {call("v-upload-injected", async () => {
        const fd = new FormData();
        fd.append("title", "hello");
        fd.append(
          "photo",
          new File([new Uint8Array(8)], "p.png", { type: "image/png" })
        );
        // Attacker-style extra field — the default `unknown` policy
        // ("reject") catches this before any handler runs.
        fd.append("role", "admin");
        return upload(fd);
      })}

      {/* arrayBuffer */}
      {call("v-ab-ok", () =>
        echoArrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer)
      )}
      {call("v-ab-oversize", () => echoArrayBuffer(new Uint8Array(64).buffer))}

      {/* typedArray */}
      {call("v-ta-ok", () => echoTypedArray(new Uint8Array([5, 6, 7, 8])))}
      {call("v-ta-bad-ctor", () => echoTypedArray(new Float32Array([1.5])))}
      {call("v-ta-oversize", () => echoTypedArray(new Uint8Array(64)))}

      {/* map */}
      {call("v-map-ok", () =>
        echoMap(
          new Map([
            ["a", 1],
            ["b", 2],
          ])
        )
      )}
      {call("v-map-oversize", () =>
        echoMap(
          new Map([
            ["a", 1],
            ["b", 2],
            ["c", 3],
            ["d", 4],
          ])
        )
      )}
      {call("v-map-bad-value", () => echoMap(new Map([["a", "not-a-number"]])))}

      {/* set */}
      {call("v-set-ok", () => echoSet(new Set(["a", "b"])))}
      {call("v-set-oversize", () => echoSet(new Set(["a", "b", "c", "d"])))}

      {/* stream — wrapped at the consumer; handler observes drainError */}
      {call("v-stream-under-cap", () =>
        echoStream(
          new ReadableStream({
            start(controller) {
              controller.enqueue("a");
              controller.enqueue("b");
              controller.close();
            },
          })
        )
      )}
      {call("v-stream-over-cap", () =>
        echoStream(
          new ReadableStream({
            start(controller) {
              controller.enqueue("a");
              controller.enqueue("b");
              controller.enqueue("c");
              controller.enqueue("d");
              controller.close();
            },
          })
        )
      )}

      {/* asyncIterable */}
      {call("v-aiter-ok", () =>
        echoAsyncIterable(
          (async function* () {
            yield 1;
            yield 2;
          })()
        )
      )}
      {call("v-aiter-overyield", () =>
        echoAsyncIterable(
          (async function* () {
            yield 1;
            yield 2;
            yield 3;
          })()
        )
      )}
      {call("v-aiter-bad-value", () =>
        echoAsyncIterable(
          (async function* () {
            yield 1;
            yield "not-a-number";
          })()
        )
      )}

      {/* iterable */}
      {call("v-iter-ok", () =>
        echoIterable(
          (function* () {
            yield 1;
            yield 2;
          })()
        )
      )}
      {call("v-iter-overyield", () =>
        echoIterable(
          (function* () {
            yield 1;
            yield 2;
            yield 3;
          })()
        )
      )}

      {/* promise */}
      {call("v-promise-ok", () => echoPromise(Promise.resolve("hello")))}
      {call("v-promise-bad-value", () => echoPromise(Promise.resolve(42)))}

      {call("v-bare-echo", () => bareEcho({ shape: "anything" }))}
    </>
  );
}
