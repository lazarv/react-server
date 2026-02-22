/**
 * Cross-compatibility tests for Temporary References between @lazarv/rsc and react-server-dom-webpack
 *
 * These tests verify that:
 * 1. Temporary references encoded by React's client can be decoded by lazarv's server (and vice versa)
 * 2. Temporary references rendered by lazarv's server can be recovered by React's client (and vice versa)
 * 3. The full round-trip works across library boundaries:
 *    - React client → lazarv server → React client
 *    - lazarv client → React server → lazarv client
 *
 * NOTE: These tests require the NODE_OPTIONS='--conditions=react-server' flag to run.
 * Run with: NODE_OPTIONS='--conditions=react-server' pnpm test __tests__/flight-cross-compat-temprefs.test.mjs
 */

import { describe, expect, test } from "vitest";

// @lazarv/rsc imports
import * as LazarvServer from "../server/shared.mjs";
import * as LazarvClient from "../client/shared.mjs";

// Try to import react-server-dom-webpack
let ReactDomServer;
let ReactDomClient;
let skipTests = false;

try {
  ReactDomServer = await import("react-server-dom-webpack/server");
  ReactDomClient = await import("react-server-dom-webpack/client.browser");
} catch {
  skipTests = true;
  console.warn(
    "Skipping cross-compatibility temp refs tests: react-server condition not enabled"
  );
  console.warn(
    "Run with: NODE_OPTIONS='--conditions=react-server' pnpm test __tests__/flight-cross-compat-temprefs.test.mjs"
  );
}

// Conditional describe that skips if react-server condition is not enabled
const describeIf = skipTests ? describe.skip : describe;

// Helper to collect stream output
async function streamToString(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

describeIf("Temporary References Cross-Compatibility", () => {
  // ─────────────────────────────────────────────────────────────────────
  // createTemporaryReferenceSet type compatibility
  // ─────────────────────────────────────────────────────────────────────
  describe("createTemporaryReferenceSet type parity", () => {
    test("server sets should both be WeakMaps", () => {
      const reactSet = ReactDomServer.createTemporaryReferenceSet();
      const lazarvSet = LazarvServer.createTemporaryReferenceSet();
      // React uses WeakMap on the server (proxy → id)
      expect(reactSet).toBeInstanceOf(WeakMap);
      expect(lazarvSet).toBeInstanceOf(WeakMap);
    });

    test("client sets should both be Maps", () => {
      const reactSet = ReactDomClient.createTemporaryReferenceSet();
      const lazarvSet = LazarvClient.createTemporaryReferenceSet();
      // Both clients use Map (path → value)
      expect(reactSet).toBeInstanceOf(Map);
      expect(lazarvSet).toBeInstanceOf(Map);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // encodeReply wire format: both produce "$T" for non-serializable values
  // ─────────────────────────────────────────────────────────────────────
  describe("encodeReply wire format compatibility", () => {
    test("React and lazarv produce identical $T placeholder for functions", async () => {
      const fn = () => {};

      const reactTempRefs = ReactDomClient.createTemporaryReferenceSet();
      const lazarvTempRefs = LazarvClient.createTemporaryReferenceSet();

      const reactEncoded = await ReactDomClient.encodeReply(
        { name: "test", handler: fn },
        { temporaryReferences: reactTempRefs }
      );
      const lazarvEncoded = await LazarvClient.encodeReply(
        { name: "test", handler: fn },
        { temporaryReferences: lazarvTempRefs }
      );

      // Both should produce JSON strings (no files)
      expect(typeof reactEncoded).toBe("string");
      expect(typeof lazarvEncoded).toBe("string");

      const reactParsed = JSON.parse(reactEncoded);
      const lazarvParsed = JSON.parse(lazarvEncoded);

      // Both should use "$T" for the non-serializable function
      expect(reactParsed.handler).toBe("$T");
      expect(lazarvParsed.handler).toBe("$T");

      // Serializable values should be identical
      expect(reactParsed.name).toBe("test");
      expect(lazarvParsed.name).toBe("test");
    });

    test("React and lazarv produce identical $T placeholder for symbols", async () => {
      const sym = Symbol("local-only");

      const reactTempRefs = ReactDomClient.createTemporaryReferenceSet();
      const lazarvTempRefs = LazarvClient.createTemporaryReferenceSet();

      const reactEncoded = await ReactDomClient.encodeReply(
        { value: 42, tag: sym },
        { temporaryReferences: reactTempRefs }
      );
      const lazarvEncoded = await LazarvClient.encodeReply(
        { value: 42, tag: sym },
        { temporaryReferences: lazarvTempRefs }
      );

      const reactParsed = JSON.parse(reactEncoded);
      const lazarvParsed = JSON.parse(lazarvEncoded);

      expect(reactParsed.tag).toBe("$T");
      expect(lazarvParsed.tag).toBe("$T");
      expect(reactParsed.value).toBe(42);
      expect(lazarvParsed.value).toBe(42);
    });

    test("both populate temp ref maps during encode", async () => {
      const fn = () => {};

      const reactTempRefs = ReactDomClient.createTemporaryReferenceSet();
      const lazarvTempRefs = LazarvClient.createTemporaryReferenceSet();

      await ReactDomClient.encodeReply(
        { handler: fn },
        { temporaryReferences: reactTempRefs }
      );
      await LazarvClient.encodeReply(
        { handler: fn },
        { temporaryReferences: lazarvTempRefs }
      );

      // Both should have stored the function in their temp ref maps
      expect(reactTempRefs.size).toBeGreaterThan(0);
      expect(lazarvTempRefs.size).toBeGreaterThan(0);

      // Both should have the original function as a value in the map
      const reactValues = Array.from(reactTempRefs.values());
      const lazarvValues = Array.from(lazarvTempRefs.values());
      expect(reactValues).toContain(fn);
      expect(lazarvValues).toContain(fn);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // encodeReply cross-feeding: one library's encode → other library's decode
  // ─────────────────────────────────────────────────────────────────────
  describe("encodeReply → decodeReply cross-feeding", () => {
    test("React encodeReply → lazarv decodeReply: function becomes opaque proxy", async () => {
      const fn = () => "hello";

      const clientTempRefs = ReactDomClient.createTemporaryReferenceSet();
      const serverTempRefs = LazarvServer.createTemporaryReferenceSet();

      const encoded = await ReactDomClient.encodeReply(
        { name: "test", handler: fn },
        { temporaryReferences: clientTempRefs }
      );

      const decoded = await LazarvServer.decodeReply(encoded, {
        temporaryReferences: serverTempRefs,
      });

      // The name should survive as-is
      expect(decoded.name).toBe("test");
      // The handler should be an opaque proxy (not the original function)
      expect(typeof decoded.handler).toBe("function");
      expect(decoded.handler.$$typeof).toBe(
        Symbol.for("react.temporary.reference")
      );
      // Accessing properties should throw
      expect(() => decoded.handler.foo).toThrow();
    });

    test("lazarv encodeReply → React decodeReply: function becomes opaque proxy", async () => {
      const fn = () => "hello";

      const clientTempRefs = LazarvClient.createTemporaryReferenceSet();
      const serverTempRefs = ReactDomServer.createTemporaryReferenceSet();

      const encoded = await LazarvClient.encodeReply(
        { name: "test", handler: fn },
        { temporaryReferences: clientTempRefs }
      );

      // React's decodeReply takes (body, webpackMap, options)
      const decoded = await ReactDomServer.decodeReply(encoded, null, {
        temporaryReferences: serverTempRefs,
      });

      expect(decoded.name).toBe("test");
      expect(typeof decoded.handler).toBe("function");
      expect(decoded.handler.$$typeof).toBe(
        Symbol.for("react.temporary.reference")
      );
      expect(() => decoded.handler.foo).toThrow();
    });

    test("React encodeReply → lazarv decodeReply: local symbol becomes opaque proxy", async () => {
      const sym = Symbol("local");

      const clientTempRefs = ReactDomClient.createTemporaryReferenceSet();
      const serverTempRefs = LazarvServer.createTemporaryReferenceSet();

      const encoded = await ReactDomClient.encodeReply(
        { result: 42, tag: sym },
        { temporaryReferences: clientTempRefs }
      );

      const decoded = await LazarvServer.decodeReply(encoded, {
        temporaryReferences: serverTempRefs,
      });

      expect(decoded.result).toBe(42);
      // tag should be an opaque temp ref proxy
      expect(decoded.tag.$$typeof).toBe(
        Symbol.for("react.temporary.reference")
      );
    });

    test("lazarv encodeReply → React decodeReply: local symbol becomes opaque proxy", async () => {
      const sym = Symbol("local");

      const clientTempRefs = LazarvClient.createTemporaryReferenceSet();
      const serverTempRefs = ReactDomServer.createTemporaryReferenceSet();

      const encoded = await LazarvClient.encodeReply(
        { result: 42, tag: sym },
        { temporaryReferences: clientTempRefs }
      );

      const decoded = await ReactDomServer.decodeReply(encoded, null, {
        temporaryReferences: serverTempRefs,
      });

      expect(decoded.result).toBe(42);
      expect(decoded.tag.$$typeof).toBe(
        Symbol.for("react.temporary.reference")
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Server render $T emission: both servers emit the same $T format
  // ─────────────────────────────────────────────────────────────────────
  describe("renderToReadableStream $T wire format", () => {
    test("both servers emit $T for temp ref proxies in the same format", async () => {
      const fn = () => {};
      const clientTempRefs = ReactDomClient.createTemporaryReferenceSet();

      const encoded = await ReactDomClient.encodeReply(
        { handler: fn },
        { temporaryReferences: clientTempRefs }
      );

      // Decode with lazarv server
      const lazarvServerRefs = LazarvServer.createTemporaryReferenceSet();
      const lazarvDecoded = await LazarvServer.decodeReply(encoded, {
        temporaryReferences: lazarvServerRefs,
      });

      // Decode with React server
      const reactServerRefs = ReactDomServer.createTemporaryReferenceSet();
      const reactDecoded = await ReactDomServer.decodeReply(encoded, null, {
        temporaryReferences: reactServerRefs,
      });

      // Render with lazarv
      const lazarvStream = LazarvServer.renderToReadableStream(lazarvDecoded, {
        temporaryReferences: lazarvServerRefs,
      });
      const lazarvWire = await streamToString(lazarvStream);

      // Render with React
      const reactStream = ReactDomServer.renderToReadableStream(
        reactDecoded,
        null,
        { temporaryReferences: reactServerRefs }
      );
      const reactWire = await streamToString(reactStream);

      // Both should contain $T in the wire format
      expect(lazarvWire).toContain('"$T');
      expect(reactWire).toContain('"$T');

      // Extract $T references from both wire formats
      const lazarvTRefs = lazarvWire.match(/"\$T[^"]*"/g) || [];
      const reactTRefs = reactWire.match(/"\$T[^"]*"/g) || [];

      // Both should emit the same number of $T references
      expect(lazarvTRefs.length).toBe(reactTRefs.length);
      expect(lazarvTRefs.length).toBeGreaterThan(0);

      // The $T reference path should be identical (same path format)
      // Both should emit $T0:handler (path = chunk_id:property_name)
      expect(lazarvTRefs).toEqual(reactTRefs);
    });

    test("both servers emit identical $T for nested temp refs", async () => {
      const fn1 = () => {};
      const fn2 = () => {};
      const clientTempRefs = ReactDomClient.createTemporaryReferenceSet();

      const encoded = await ReactDomClient.encodeReply(
        {
          items: [
            { name: "a", action: fn1 },
            { name: "b", action: fn2 },
          ],
        },
        { temporaryReferences: clientTempRefs }
      );

      const lazarvServerRefs = LazarvServer.createTemporaryReferenceSet();
      const lazarvDecoded = await LazarvServer.decodeReply(encoded, {
        temporaryReferences: lazarvServerRefs,
      });

      const reactServerRefs = ReactDomServer.createTemporaryReferenceSet();
      const reactDecoded = await ReactDomServer.decodeReply(encoded, null, {
        temporaryReferences: reactServerRefs,
      });

      const lazarvStream = LazarvServer.renderToReadableStream(lazarvDecoded, {
        temporaryReferences: lazarvServerRefs,
      });
      const lazarvWire = await streamToString(lazarvStream);

      const reactStream = ReactDomServer.renderToReadableStream(
        reactDecoded,
        null,
        { temporaryReferences: reactServerRefs }
      );
      const reactWire = await streamToString(reactStream);

      // Extract $T references from both wire formats
      const lazarvTRefs = (lazarvWire.match(/"\$T[^"]*"/g) || []).toSorted();
      const reactTRefs = (reactWire.match(/"\$T[^"]*"/g) || []).toSorted();

      // Both should emit the same number of $T references
      expect(lazarvTRefs.length).toBe(reactTRefs.length);
      expect(lazarvTRefs.length).toBeGreaterThan(0);

      // The $T reference paths should be identical between servers
      expect(lazarvTRefs).toEqual(reactTRefs);
      // Both servers emit the root object as a single $T (the entire structure
      // is recovered as one temp ref on the client). Items arrays and nested
      // objects are part of the root temp ref, so only 1 $T is emitted.
      expect(lazarvTRefs.length).toBe(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Full round-trip: React client ↔ lazarv server
  // ─────────────────────────────────────────────────────────────────────
  describe("Full round-trip: React client ↔ lazarv server", () => {
    test("function survives React encode → lazarv decode+render → React decode", async () => {
      const originalFn = () => "I am the original";

      // React client: encode
      const clientTempRefs = ReactDomClient.createTemporaryReferenceSet();
      const encoded = await ReactDomClient.encodeReply(
        { name: "test", handler: originalFn },
        { temporaryReferences: clientTempRefs }
      );

      // lazarv server: decode
      const serverTempRefs = LazarvServer.createTemporaryReferenceSet();
      const decoded = await LazarvServer.decodeReply(encoded, {
        temporaryReferences: serverTempRefs,
      });

      // lazarv server: render back
      const stream = LazarvServer.renderToReadableStream(decoded, {
        temporaryReferences: serverTempRefs,
      });

      // React client: recover
      const result = await ReactDomClient.createFromReadableStream(stream, {
        temporaryReferences: clientTempRefs,
      });

      expect(result.name).toBe("test");
      expect(result.handler).toBe(originalFn);
    });

    test("local symbol survives React encode → lazarv decode+render → React decode", async () => {
      const sym = Symbol("private-tag");

      const clientTempRefs = ReactDomClient.createTemporaryReferenceSet();
      const encoded = await ReactDomClient.encodeReply(
        { result: 99, tag: sym },
        { temporaryReferences: clientTempRefs }
      );

      const serverTempRefs = LazarvServer.createTemporaryReferenceSet();
      const decoded = await LazarvServer.decodeReply(encoded, {
        temporaryReferences: serverTempRefs,
      });

      const stream = LazarvServer.renderToReadableStream(decoded, {
        temporaryReferences: serverTempRefs,
      });

      const result = await ReactDomClient.createFromReadableStream(stream, {
        temporaryReferences: clientTempRefs,
      });

      expect(result.result).toBe(99);
      expect(result.tag).toBe(sym);
    });

    test("multiple functions in nested structure survive round-trip", async () => {
      const fn1 = function onClick() {};
      const fn2 = function onHover() {};
      const fn3 = () => {};

      const clientTempRefs = ReactDomClient.createTemporaryReferenceSet();
      const encoded = await ReactDomClient.encodeReply(
        {
          items: [
            { name: "a", handler: fn1 },
            { name: "b", handler: fn2 },
          ],
          globalAction: fn3,
        },
        { temporaryReferences: clientTempRefs }
      );

      const serverTempRefs = LazarvServer.createTemporaryReferenceSet();
      const decoded = await LazarvServer.decodeReply(encoded, {
        temporaryReferences: serverTempRefs,
      });

      const stream = LazarvServer.renderToReadableStream(decoded, {
        temporaryReferences: serverTempRefs,
      });

      const result = await ReactDomClient.createFromReadableStream(stream, {
        temporaryReferences: clientTempRefs,
      });

      expect(result.items[0].name).toBe("a");
      expect(result.items[0].handler).toBe(fn1);
      expect(result.items[1].name).toBe("b");
      expect(result.items[1].handler).toBe(fn2);
      expect(result.globalAction).toBe(fn3);
    });

    test("serializable data alongside temp refs is preserved", async () => {
      const fn = () => {};

      const clientTempRefs = ReactDomClient.createTemporaryReferenceSet();
      const encoded = await ReactDomClient.encodeReply(
        {
          count: 42,
          label: "hello",
          nested: { x: 1, y: 2 },
          active: true,
          handler: fn,
        },
        { temporaryReferences: clientTempRefs }
      );

      const serverTempRefs = LazarvServer.createTemporaryReferenceSet();
      const decoded = await LazarvServer.decodeReply(encoded, {
        temporaryReferences: serverTempRefs,
      });

      const stream = LazarvServer.renderToReadableStream(decoded, {
        temporaryReferences: serverTempRefs,
      });

      const result = await ReactDomClient.createFromReadableStream(stream, {
        temporaryReferences: clientTempRefs,
      });

      expect(result.count).toBe(42);
      expect(result.label).toBe("hello");
      expect(result.nested).toEqual({ x: 1, y: 2 });
      expect(result.active).toBe(true);
      expect(result.handler).toBe(fn);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Full round-trip: lazarv client ↔ React server
  // ─────────────────────────────────────────────────────────────────────
  describe("Full round-trip: lazarv client ↔ React server", () => {
    test("function survives lazarv encode → React decode+render → lazarv decode", async () => {
      const originalFn = () => "I am the original";

      // lazarv client: encode
      const clientTempRefs = LazarvClient.createTemporaryReferenceSet();
      const encoded = await LazarvClient.encodeReply(
        { name: "test", handler: originalFn },
        { temporaryReferences: clientTempRefs }
      );

      // React server: decode (takes webpackMap as second arg)
      const serverTempRefs = ReactDomServer.createTemporaryReferenceSet();
      const decoded = await ReactDomServer.decodeReply(encoded, null, {
        temporaryReferences: serverTempRefs,
      });

      // React server: render back (takes webpackMap as second arg)
      const stream = ReactDomServer.renderToReadableStream(decoded, null, {
        temporaryReferences: serverTempRefs,
      });

      // lazarv client: recover
      const result = await LazarvClient.createFromReadableStream(stream, {
        temporaryReferences: clientTempRefs,
      });

      expect(result.name).toBe("test");
      expect(result.handler).toBe(originalFn);
    });

    test("local symbol survives lazarv encode → React decode+render → lazarv decode", async () => {
      const sym = Symbol("my-local-sym");

      const clientTempRefs = LazarvClient.createTemporaryReferenceSet();
      const encoded = await LazarvClient.encodeReply(
        { value: "ok", tag: sym },
        { temporaryReferences: clientTempRefs }
      );

      const serverTempRefs = ReactDomServer.createTemporaryReferenceSet();
      const decoded = await ReactDomServer.decodeReply(encoded, null, {
        temporaryReferences: serverTempRefs,
      });

      const stream = ReactDomServer.renderToReadableStream(decoded, null, {
        temporaryReferences: serverTempRefs,
      });

      const result = await LazarvClient.createFromReadableStream(stream, {
        temporaryReferences: clientTempRefs,
      });

      expect(result.value).toBe("ok");
      expect(result.tag).toBe(sym);
    });

    test("multiple functions in nested structure survive round-trip", async () => {
      const fn1 = function onSave() {};
      const fn2 = function onCancel() {};

      const clientTempRefs = LazarvClient.createTemporaryReferenceSet();
      const encoded = await LazarvClient.encodeReply(
        {
          items: [
            { label: "save", action: fn1 },
            { label: "cancel", action: fn2 },
          ],
        },
        { temporaryReferences: clientTempRefs }
      );

      const serverTempRefs = ReactDomServer.createTemporaryReferenceSet();
      const decoded = await ReactDomServer.decodeReply(encoded, null, {
        temporaryReferences: serverTempRefs,
      });

      const stream = ReactDomServer.renderToReadableStream(decoded, null, {
        temporaryReferences: serverTempRefs,
      });

      const result = await LazarvClient.createFromReadableStream(stream, {
        temporaryReferences: clientTempRefs,
      });

      expect(result.items[0].label).toBe("save");
      expect(result.items[0].action).toBe(fn1);
      expect(result.items[1].label).toBe("cancel");
      expect(result.items[1].action).toBe(fn2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Mixed server round-trip: verify both servers can relay temp refs
  // identically by checking React client encode → both servers → React client decode
  // ─────────────────────────────────────────────────────────────────────
  describe("Server interchangeability", () => {
    test("React client should recover same values regardless of which server relays", async () => {
      const fn = () => {};
      const sym = Symbol("x");

      const clientTempRefs1 = ReactDomClient.createTemporaryReferenceSet();
      const clientTempRefs2 = ReactDomClient.createTemporaryReferenceSet();

      const data = { handler: fn, tag: sym, safe: "hello" };

      // Path A: React client → lazarv server → React client
      const encoded1 = await ReactDomClient.encodeReply(data, {
        temporaryReferences: clientTempRefs1,
      });
      const lazarvServerRefs = LazarvServer.createTemporaryReferenceSet();
      const decoded1 = await LazarvServer.decodeReply(encoded1, {
        temporaryReferences: lazarvServerRefs,
      });
      const stream1 = LazarvServer.renderToReadableStream(decoded1, {
        temporaryReferences: lazarvServerRefs,
      });
      const result1 = await ReactDomClient.createFromReadableStream(stream1, {
        temporaryReferences: clientTempRefs1,
      });

      // Path B: React client → React server → React client
      const encoded2 = await ReactDomClient.encodeReply(data, {
        temporaryReferences: clientTempRefs2,
      });
      const reactServerRefs = ReactDomServer.createTemporaryReferenceSet();
      const decoded2 = await ReactDomServer.decodeReply(encoded2, null, {
        temporaryReferences: reactServerRefs,
      });
      const stream2 = ReactDomServer.renderToReadableStream(decoded2, null, {
        temporaryReferences: reactServerRefs,
      });
      const result2 = await ReactDomClient.createFromReadableStream(stream2, {
        temporaryReferences: clientTempRefs2,
      });

      // Both paths should recover the same values
      expect(result1.handler).toBe(fn);
      expect(result2.handler).toBe(fn);
      expect(result1.tag).toBe(sym);
      expect(result2.tag).toBe(sym);
      expect(result1.safe).toBe("hello");
      expect(result2.safe).toBe("hello");
    });

    test("lazarv client should recover same values regardless of which server relays", async () => {
      const fn = () => {};

      const clientTempRefs1 = LazarvClient.createTemporaryReferenceSet();
      const clientTempRefs2 = LazarvClient.createTemporaryReferenceSet();

      const data = { action: fn, label: "go" };

      // Path A: lazarv client → React server → lazarv client
      const encoded1 = await LazarvClient.encodeReply(data, {
        temporaryReferences: clientTempRefs1,
      });
      const reactServerRefs = ReactDomServer.createTemporaryReferenceSet();
      const decoded1 = await ReactDomServer.decodeReply(encoded1, null, {
        temporaryReferences: reactServerRefs,
      });
      const stream1 = ReactDomServer.renderToReadableStream(decoded1, null, {
        temporaryReferences: reactServerRefs,
      });
      const result1 = await LazarvClient.createFromReadableStream(stream1, {
        temporaryReferences: clientTempRefs1,
      });

      // Path B: lazarv client → lazarv server → lazarv client
      const encoded2 = await LazarvClient.encodeReply(data, {
        temporaryReferences: clientTempRefs2,
      });
      const lazarvServerRefs = LazarvServer.createTemporaryReferenceSet();
      const decoded2 = await LazarvServer.decodeReply(encoded2, {
        temporaryReferences: lazarvServerRefs,
      });
      const stream2 = LazarvServer.renderToReadableStream(decoded2, {
        temporaryReferences: lazarvServerRefs,
      });
      const result2 = await LazarvClient.createFromReadableStream(stream2, {
        temporaryReferences: clientTempRefs2,
      });

      // Both paths should recover the same values
      expect(result1.action).toBe(fn);
      expect(result2.action).toBe(fn);
      expect(result1.label).toBe("go");
      expect(result2.label).toBe("go");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Server proxy behavior compatibility
  // ─────────────────────────────────────────────────────────────────────
  describe("Server-side temp ref proxy behavior parity", () => {
    test("both servers create proxies with react.temporary.reference $$typeof", async () => {
      const fn = () => {};
      const clientTempRefs = ReactDomClient.createTemporaryReferenceSet();

      const encoded = await ReactDomClient.encodeReply(
        { handler: fn },
        { temporaryReferences: clientTempRefs }
      );

      const lazarvServerRefs = LazarvServer.createTemporaryReferenceSet();
      const lazarvDecoded = await LazarvServer.decodeReply(encoded, {
        temporaryReferences: lazarvServerRefs,
      });

      const reactServerRefs = ReactDomServer.createTemporaryReferenceSet();
      const reactDecoded = await ReactDomServer.decodeReply(encoded, null, {
        temporaryReferences: reactServerRefs,
      });

      // Both should produce proxies with the same $$typeof
      expect(lazarvDecoded.handler.$$typeof).toBe(
        Symbol.for("react.temporary.reference")
      );
      expect(reactDecoded.handler.$$typeof).toBe(
        Symbol.for("react.temporary.reference")
      );
    });

    test("both servers throw on property access of temp ref proxies", async () => {
      const fn = () => {};
      const clientTempRefs = ReactDomClient.createTemporaryReferenceSet();

      const encoded = await ReactDomClient.encodeReply(
        { handler: fn },
        { temporaryReferences: clientTempRefs }
      );

      const lazarvServerRefs = LazarvServer.createTemporaryReferenceSet();
      const lazarvDecoded = await LazarvServer.decodeReply(encoded, {
        temporaryReferences: lazarvServerRefs,
      });

      const reactServerRefs = ReactDomServer.createTemporaryReferenceSet();
      const reactDecoded = await ReactDomServer.decodeReply(encoded, null, {
        temporaryReferences: reactServerRefs,
      });

      // Both should throw when accessing arbitrary properties
      expect(() => lazarvDecoded.handler.someProperty).toThrow();
      expect(() => reactDecoded.handler.someProperty).toThrow();

      // Both should throw on assignment
      expect(() => {
        lazarvDecoded.handler.x = 1;
      }).toThrow();
      expect(() => {
        reactDecoded.handler.x = 1;
      }).toThrow();
    });

    test("both servers allow .then access (returns undefined, not thenable)", async () => {
      const fn = () => {};
      const clientTempRefs = ReactDomClient.createTemporaryReferenceSet();

      const encoded = await ReactDomClient.encodeReply(
        { handler: fn },
        { temporaryReferences: clientTempRefs }
      );

      const lazarvServerRefs = LazarvServer.createTemporaryReferenceSet();
      const lazarvDecoded = await LazarvServer.decodeReply(encoded, {
        temporaryReferences: lazarvServerRefs,
      });

      const reactServerRefs = ReactDomServer.createTemporaryReferenceSet();
      const reactDecoded = await ReactDomServer.decodeReply(encoded, null, {
        temporaryReferences: reactServerRefs,
      });

      // .then should be undefined (prevents being treated as thenable/promise)
      expect(lazarvDecoded.handler.then).toBeUndefined();
      expect(reactDecoded.handler.then).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Edge cases
  // ─────────────────────────────────────────────────────────────────────
  describe("Edge cases", () => {
    test("top-level non-serializable value with temp refs (lazarv client ↔ lazarv server)", async () => {
      // NOTE: React's encodeReply rejects bare functions as root value, even with
      // temporaryReferences. Only objects/arrays containing functions are supported.
      // lazarv's encodeReply is more permissive and allows this, so we test
      // the lazarv ↔ lazarv path only, plus verify React rejects it.
      const fn = () => {};

      // Verify React rejects top-level function
      await expect(
        ReactDomClient.encodeReply(fn, {
          temporaryReferences: ReactDomClient.createTemporaryReferenceSet(),
        })
      ).rejects.toThrow();

      // lazarv client → lazarv server → lazarv client
      const clientTempRefs = LazarvClient.createTemporaryReferenceSet();
      const encoded = await LazarvClient.encodeReply(fn, {
        temporaryReferences: clientTempRefs,
      });

      const serverTempRefs = LazarvServer.createTemporaryReferenceSet();
      const decoded = await LazarvServer.decodeReply(encoded, {
        temporaryReferences: serverTempRefs,
      });

      const stream = LazarvServer.renderToReadableStream(decoded, {
        temporaryReferences: serverTempRefs,
      });

      const result = await LazarvClient.createFromReadableStream(stream, {
        temporaryReferences: clientTempRefs,
      });

      expect(result).toBe(fn);
    });

    test("array of non-serializable values", async () => {
      const fn1 = () => {};
      const fn2 = () => {};
      const sym = Symbol("s");

      const clientTempRefs = ReactDomClient.createTemporaryReferenceSet();
      const encoded = await ReactDomClient.encodeReply(
        [fn1, "serializable", fn2, sym],
        { temporaryReferences: clientTempRefs }
      );

      const serverTempRefs = LazarvServer.createTemporaryReferenceSet();
      const decoded = await LazarvServer.decodeReply(encoded, {
        temporaryReferences: serverTempRefs,
      });

      const stream = LazarvServer.renderToReadableStream(decoded, {
        temporaryReferences: serverTempRefs,
      });

      const result = await ReactDomClient.createFromReadableStream(stream, {
        temporaryReferences: clientTempRefs,
      });

      expect(result[0]).toBe(fn1);
      expect(result[1]).toBe("serializable");
      expect(result[2]).toBe(fn2);
      expect(result[3]).toBe(sym);
    });

    test("deeply nested temp refs survive cross-library round-trip", async () => {
      const fn = () => {};

      const clientTempRefs = LazarvClient.createTemporaryReferenceSet();
      const encoded = await LazarvClient.encodeReply(
        { a: { b: { c: { handler: fn, value: 123 } } } },
        { temporaryReferences: clientTempRefs }
      );

      const serverTempRefs = ReactDomServer.createTemporaryReferenceSet();
      const decoded = await ReactDomServer.decodeReply(encoded, null, {
        temporaryReferences: serverTempRefs,
      });

      const stream = ReactDomServer.renderToReadableStream(decoded, null, {
        temporaryReferences: serverTempRefs,
      });

      const result = await LazarvClient.createFromReadableStream(stream, {
        temporaryReferences: clientTempRefs,
      });

      expect(result.a.b.c.value).toBe(123);
      expect(result.a.b.c.handler).toBe(fn);
    });

    test("empty objects/arrays alongside temp refs", async () => {
      const fn = () => {};

      const clientTempRefs = ReactDomClient.createTemporaryReferenceSet();
      const encoded = await ReactDomClient.encodeReply(
        { empty: {}, emptyArr: [], handler: fn, data: null },
        { temporaryReferences: clientTempRefs }
      );

      const serverTempRefs = LazarvServer.createTemporaryReferenceSet();
      const decoded = await LazarvServer.decodeReply(encoded, {
        temporaryReferences: serverTempRefs,
      });

      const stream = LazarvServer.renderToReadableStream(decoded, {
        temporaryReferences: serverTempRefs,
      });

      const result = await ReactDomClient.createFromReadableStream(stream, {
        temporaryReferences: clientTempRefs,
      });

      expect(result.empty).toEqual({});
      expect(result.emptyArr).toEqual([]);
      expect(result.handler).toBe(fn);
      expect(result.data).toBeNull();
    });
  });
});
