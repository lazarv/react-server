"use client";

import { echoArg } from "./server-function-arg-types-actions.mjs";

/**
 * Each button constructs a client-side value of a specific type, calls the
 * `echoArg` server function with it, and stashes the server's descriptor in
 * `window.__react_server_result__` for the spec to assert on.
 *
 * Button names match the spec's `cases` table; keep them in sync.
 */
export default function ServerFunctionArgTypesClient() {
  const call = (name, buildArg) => (
    <button
      key={name}
      data-testid={name}
      onClick={async () => {
        window.__react_server_result__ = undefined;
        try {
          const arg = buildArg();
          const result = await echoArg(arg);
          window.__react_server_result__ = result;
          console.log(`arg-type ${name} →`, JSON.stringify(result));
        } catch (e) {
          window.__react_server_result__ = {
            kind: "clientError",
            message: String(e?.message ?? e),
          };
          console.log(`arg-type ${name} error →`, e?.message ?? e);
        }
      }}
    >
      {name}
    </button>
  );

  return (
    <>
      {/* suppressHydrationWarning for the dev-mode double render */}
      <div suppressHydrationWarning>{Math.random()}</div>

      {call("arg-string", () => "hello")}
      {call("arg-number", () => 42)}
      {call("arg-nan", () => NaN)}
      {call("arg-infinity", () => Infinity)}
      {call("arg-neg-infinity", () => -Infinity)}
      {call("arg-bigint", () => 9007199254740993n)}
      {call("arg-boolean", () => true)}
      {call("arg-null", () => null)}
      {call("arg-undefined", () => undefined)}
      {call("arg-symbol", () => Symbol.for("rsc.test"))}
      {call("arg-date", () => new Date("2024-01-02T03:04:05.000Z"))}
      {call("arg-regexp", () => /abc/gi)}
      {call("arg-url", () => new URL("https://example.test/path?x=1"))}
      {call(
        "arg-url-search-params",
        () => new URLSearchParams("a=1&b=two&a=3")
      )}
      {call(
        "arg-map",
        () =>
          new Map([
            ["k1", "v1"],
            ["k2", 2],
          ])
      )}
      {call("arg-set", () => new Set(["a", "b", "c"]))}
      {call("arg-array-buffer", () => {
        const ab = new ArrayBuffer(4);
        new Uint8Array(ab).set([1, 2, 3, 4]);
        return ab;
      })}
      {call("arg-uint8array", () => new Uint8Array([10, 20, 30]))}
      {call("arg-blob", () => new Blob(["hello-blob"], { type: "text/plain" }))}
      {call("arg-file", () => {
        if (typeof File === "undefined") {
          // Fall back to Blob on environments without File.
          return new Blob(["hello-file"], { type: "text/plain" });
        }
        return new File(["hello-file"], "hello.txt", { type: "text/plain" });
      })}
      {call("arg-formdata", () => {
        const fd = new FormData();
        fd.append("name", "alice");
        fd.append("age", "30");
        fd.append(
          "bio",
          new Blob(["a bio"], { type: "text/plain" }),
          "bio.txt"
        );
        return fd;
      })}
      {call("arg-promise", () => Promise.resolve({ ok: 1, who: "alice" }))}
      {call("arg-readable-stream", () => {
        return new ReadableStream({
          start(controller) {
            controller.enqueue("chunk-a");
            controller.enqueue("chunk-b");
            controller.close();
          },
        });
      })}
      {call("arg-async-iterable", () => {
        async function* gen() {
          yield "async-0";
          yield "async-1";
          yield "async-2";
        }
        return gen();
      })}
      {call("arg-iterator", () => {
        function* gen() {
          yield "sync-0";
          yield "sync-1";
        }
        return gen();
      })}
      {call("arg-array", () => [1, "two", true])}
      {call("arg-nested-object", () => ({
        name: "root",
        nested: { n: 1 },
        list: [{ i: 0 }, { i: 1 }],
      }))}
      {call("arg-shared-ref", () => {
        const inner = { shared: true };
        return { a: inner, b: inner };
      })}
    </>
  );
}
