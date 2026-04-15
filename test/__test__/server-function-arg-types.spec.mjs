/**
 * Integration test: client → server argument encoding for every data type
 * that @lazarv/rsc's encodeReply/decodeReply supports.
 *
 * For each case we:
 *   1. Click a button that constructs a specific client-side value and
 *      calls the `echoArg` server function with it as the sole argument.
 *   2. Wait for the server function to complete and for the client to store
 *      the returned descriptor on `window.__react_server_result__`.
 *   3. Assert that the descriptor matches what the server should have seen
 *      after decoding the argument.
 *
 * This exercises the full react-server stack:
 *   encodeReply (client) → HTTP POST (FormData) → decodeReply (server)
 *
 * Security regressions in the decoder (CVE-2025-55182 class issues) would
 * either throw or corrupt the decoded arg; in either case the descriptor
 * would no longer match, so these tests double as a smoke test for the
 * decoder hardening.
 */
import * as setup from "playground/utils";
import { beforeAll, expect, test } from "vitest";

/**
 * Each case: [buttonName, expectedDescriptor].
 *
 * expectedDescriptor may be a plain object (deep-equal match) or a function
 * that takes the descriptor and performs custom assertions — used where the
 * server round-trip yields a shape that isn't cleanly described by a literal
 * (e.g. file mtime or blob type quirks).
 */
const cases = [
  ["arg-string", { kind: "string", value: "hello" }],
  ["arg-number", { kind: "number", value: 42 }],
  ["arg-nan", { kind: "NaN" }],
  ["arg-infinity", { kind: "Infinity" }],
  ["arg-neg-infinity", { kind: "-Infinity" }],
  ["arg-bigint", { kind: "bigint", value: "9007199254740993" }],
  ["arg-boolean", { kind: "boolean", value: true }],
  ["arg-null", { kind: "null" }],
  ["arg-undefined", { kind: "undefined" }],
  ["arg-symbol", { kind: "symbol", key: "rsc.test" }],
  ["arg-date", { kind: "Date", iso: "2024-01-02T03:04:05.000Z" }],
  ["arg-regexp", { kind: "RegExp", source: "abc", flags: "gi" }],
  ["arg-url", { kind: "URL", href: "https://example.test/path?x=1" }],
  [
    "arg-url-search-params",
    { kind: "URLSearchParams", string: "a=1&b=two&a=3" },
  ],
  [
    "arg-map",
    {
      kind: "Map",
      entries: [
        ["k1", "v1"],
        ["k2", 2],
      ],
    },
  ],
  ["arg-set", { kind: "Set", values: ["a", "b", "c"] }],
  [
    "arg-array-buffer",
    { kind: "ArrayBuffer", byteLength: 4, bytes: [1, 2, 3, 4] },
  ],
  [
    "arg-uint8array",
    { kind: "Uint8Array", byteLength: 3, values: [10, 20, 30] },
  ],
  [
    "arg-blob",
    (d) => {
      // HTTP multipart parsers on the server typically normalize incoming
      // Blob parts into File objects — there's no wire distinction between
      // an originally-nameless Blob and a File. Accept either.
      expect(["Blob", "File"]).toContain(d.kind);
      expect(d.text).toBe("hello-blob");
      expect(d.type).toMatch(/text\/plain/);
    },
  ],
  [
    "arg-file",
    (d) => {
      // File may downgrade to Blob in older runtimes, so accept either.
      expect(["File", "Blob"]).toContain(d.kind);
      expect(d.text).toBe("hello-file");
      expect(d.type).toMatch(/text\/plain/);
      if (d.kind === "File") {
        expect(d.name).toBe("hello.txt");
      }
    },
  ],
  [
    "arg-formdata",
    (d) => {
      expect(d.kind).toBe("FormData");
      const asMap = new Map();
      for (const [k, v] of d.entries) {
        if (!asMap.has(k)) asMap.set(k, []);
        asMap.get(k).push(v);
      }
      expect(asMap.get("name")).toEqual(["alice"]);
      expect(asMap.get("age")).toEqual(["30"]);
      // bio is a Blob entry — descriptor replaces it with a Blob summary.
      const bio = asMap.get("bio")?.[0];
      expect(bio).toBeDefined();
      expect(bio.kind).toBe("Blob");
    },
  ],
  ["arg-promise", { kind: "Promise", resolved: { ok: 1, who: "alice" } }],
  [
    "arg-readable-stream",
    { kind: "ReadableStream", chunks: ["chunk-a", "chunk-b"] },
  ],
  [
    "arg-async-iterable",
    { kind: "AsyncIterable", chunks: ["async-0", "async-1", "async-2"] },
  ],
  [
    "arg-iterator",
    (d) => {
      // Iterator may be decoded as AsyncIterable on the server (generators
      // are compatible with both protocols post-serialization). Accept
      // either, as long as the items round-trip.
      expect(["Iterator", "AsyncIterable"]).toContain(d.kind);
      expect(d.chunks).toEqual(["sync-0", "sync-1"]);
    },
  ],
  ["arg-array", { kind: "Array", length: 3, value: [1, "two", true] }],
  [
    "arg-nested-object",
    (d) => {
      expect(d.kind).toBe("object");
      expect(d.value.name).toBe("root");
      expect(d.value.nested).toEqual({ n: 1 });
      expect(d.value.list).toEqual([{ i: 0 }, { i: 1 }]);
    },
  ],
  [
    "arg-shared-ref",
    (d) => {
      expect(d.kind).toBe("object");
      // The encoder does not outline shared references into separate rows;
      // the first visit is serialized inline, subsequent visits fall back
      // to a temp-ref proxy (or undefined without a temp-ref set). All we
      // can assert is that `a` is reconstructed with its content.
      expect(d.value.a).toEqual({ shared: true });
    },
  ],
];

async function readResult() {
  await setup.page.waitForFunction(
    () => window.__react_server_result__ !== undefined,
    null,
    { timeout: 15000 }
  );
  return setup.page.evaluate(() => window.__react_server_result__);
}

// Single server boot for the whole spec — every test targets the same fixture
// and only differs in which button it clicks, so there's no need to pay the
// ~5s Vite dev-server startup cost per case.
beforeAll(async () => {
  await setup.server("fixtures/server-function-arg-types.jsx");
  await setup.page.goto(setup.hostname);
  await setup.waitForHydration();
});

for (const [name, expected] of cases) {
  test(`server function arg type: ${name}`, async () => {
    await setup.page.evaluate(() => {
      window.__react_server_result__ = undefined;
    });

    const button = setup.page.getByTestId(name);
    await button.click();

    const result = await readResult();

    if (typeof expected === "function") {
      expected(result);
    } else {
      expect(result).toEqual(expected);
    }
  });
}
