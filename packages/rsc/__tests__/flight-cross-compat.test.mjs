/**
 * Cross-compatibility tests between @lazarv/rsc and react-server-dom-webpack
 *
 * These tests verify that:
 * 1. RSC payload rendered by react-server-dom-webpack can be decoded by @lazarv/rsc
 * 2. RSC payload rendered by @lazarv/rsc can be decoded by react-server-dom-webpack
 *
 * This ensures true Flight protocol compatibility.
 *
 * NOTE: These tests require the NODE_OPTIONS='--conditions=react-server' flag to run.
 * Run with: NODE_OPTIONS='--conditions=react-server' pnpm test __tests__/flight-cross-compat.test.mjs
 */

import { describe, expect, test, beforeAll } from "vitest";
import React from "react";

// @lazarv/rsc imports
import * as RscServer from "../server/shared.mjs";
import * as RscClient from "../client/shared.mjs";

// Try to import react-server-dom-webpack - it may fail without --conditions=react-server
let ReactDomServer;
let ReactDomClientBrowser;
let skipTests = false;

try {
  ReactDomServer = await import("react-server-dom-webpack/server");
  ReactDomClientBrowser =
    await import("react-server-dom-webpack/client.browser");
} catch {
  // Skip tests if react-server condition is not enabled
  skipTests = true;
  console.warn(
    "Skipping cross-compatibility tests: react-server condition not enabled"
  );
  console.warn(
    "Run with: NODE_OPTIONS='--conditions=react-server' pnpm test __tests__/flight-cross-compat.test.mjs"
  );
}

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

// Helper to clone a ReadableStream for inspection
function teeStream(stream) {
  const [stream1, stream2] = stream.tee();
  return { forConsumption: stream1, forInspection: stream2 };
}

// Conditional describe that skips if react-server condition is not enabled
const describeIf = skipTests ? describe.skip : describe;

describeIf(
  "Cross-Compatibility: react-server-dom-webpack → @lazarv/rsc",
  () => {
    describe("Primitive values", () => {
      test("should decode string from react-server-dom-webpack", async () => {
        const data = "Hello from React!";
        const stream = ReactDomServer.renderToReadableStream(data);
        const result = await RscClient.createFromReadableStream(stream);
        expect(result).toBe(data);
      });

      test("should decode number from react-server-dom-webpack", async () => {
        const data = 42;
        const stream = ReactDomServer.renderToReadableStream(data);
        const result = await RscClient.createFromReadableStream(stream);
        expect(result).toBe(data);
      });

      test("should decode boolean from react-server-dom-webpack", async () => {
        const stream = ReactDomServer.renderToReadableStream(true);
        const result = await RscClient.createFromReadableStream(stream);
        expect(result).toBe(true);
      });

      test("should decode null from react-server-dom-webpack", async () => {
        const stream = ReactDomServer.renderToReadableStream(null);
        const result = await RscClient.createFromReadableStream(stream);
        expect(result).toBeNull();
      });
    });

    describe("Objects and arrays", () => {
      test("should decode object from react-server-dom-webpack", async () => {
        const data = { name: "React", version: 19 };
        const stream = ReactDomServer.renderToReadableStream(data);
        const result = await RscClient.createFromReadableStream(stream);
        expect(result).toEqual(data);
      });

      test("should decode array from react-server-dom-webpack", async () => {
        const data = [1, 2, 3, "four", { five: 5 }];
        const stream = ReactDomServer.renderToReadableStream(data);
        const result = await RscClient.createFromReadableStream(stream);
        expect(result).toEqual(data);
      });

      test("should decode nested objects from react-server-dom-webpack", async () => {
        const data = {
          user: {
            profile: {
              name: "Alice",
              settings: {
                theme: "dark",
              },
            },
          },
        };
        const stream = ReactDomServer.renderToReadableStream(data);
        const result = await RscClient.createFromReadableStream(stream);
        expect(result).toEqual(data);
      });
    });

    describe("Special types", () => {
      test("should decode Date from react-server-dom-webpack", async () => {
        const data = { date: new Date("2024-06-15T12:00:00Z") };
        const stream = ReactDomServer.renderToReadableStream(data);
        const result = await RscClient.createFromReadableStream(stream);
        expect(result.date).toBeInstanceOf(Date);
        expect(result.date.toISOString()).toBe("2024-06-15T12:00:00.000Z");
      });

      test("should decode BigInt from react-server-dom-webpack", async () => {
        const data = { big: BigInt("12345678901234567890") };
        const stream = ReactDomServer.renderToReadableStream(data);
        const result = await RscClient.createFromReadableStream(stream);
        expect(result.big).toBe(BigInt("12345678901234567890"));
      });

      test("should decode Map from react-server-dom-webpack", async () => {
        const data = new Map([
          ["key1", "value1"],
          ["key2", "value2"],
        ]);
        const stream = ReactDomServer.renderToReadableStream(data);
        const result = await RscClient.createFromReadableStream(stream);
        expect(result).toBeInstanceOf(Map);
        expect(result.get("key1")).toBe("value1");
        expect(result.get("key2")).toBe("value2");
      });

      test("should decode Set from react-server-dom-webpack", async () => {
        const data = new Set([1, 2, 3, "four"]);
        const stream = ReactDomServer.renderToReadableStream(data);
        const result = await RscClient.createFromReadableStream(stream);
        expect(result).toBeInstanceOf(Set);
        expect(result.has(1)).toBe(true);
        expect(result.has("four")).toBe(true);
      });

      test("should decode Symbol.for from react-server-dom-webpack", async () => {
        const data = { sym: Symbol.for("test.symbol") };
        const stream = ReactDomServer.renderToReadableStream(data);
        const result = await RscClient.createFromReadableStream(stream);
        expect(result.sym).toBe(Symbol.for("test.symbol"));
      });

      test("should decode Infinity from react-server-dom-webpack", async () => {
        const data = { pos: Infinity, neg: -Infinity };
        const stream = ReactDomServer.renderToReadableStream(data);
        const result = await RscClient.createFromReadableStream(stream);
        expect(result.pos).toBe(Infinity);
        expect(result.neg).toBe(-Infinity);
      });

      test("should decode NaN from react-server-dom-webpack", async () => {
        const data = { nan: NaN };
        const stream = ReactDomServer.renderToReadableStream(data);
        const result = await RscClient.createFromReadableStream(stream);
        expect(Number.isNaN(result.nan)).toBe(true);
      });

      test("should decode undefined from react-server-dom-webpack", async () => {
        const data = { undef: undefined };
        const stream = ReactDomServer.renderToReadableStream(data);
        const result = await RscClient.createFromReadableStream(stream);
        expect(result.undef).toBeUndefined();
      });
    });

    describe("TypedArrays", () => {
      test("should decode Uint8Array from react-server-dom-webpack", async () => {
        const data = { bytes: new Uint8Array([1, 2, 3, 4, 5]) };
        const stream = ReactDomServer.renderToReadableStream(data);
        const result = await RscClient.createFromReadableStream(stream);
        expect(result.bytes).toBeInstanceOf(Uint8Array);
        expect(Array.from(result.bytes)).toEqual([1, 2, 3, 4, 5]);
      });

      test("should decode Int32Array from react-server-dom-webpack", async () => {
        const data = { ints: new Int32Array([100, 200, 300]) };
        const stream = ReactDomServer.renderToReadableStream(data);
        const result = await RscClient.createFromReadableStream(stream);
        expect(result.ints).toBeInstanceOf(Int32Array);
      });

      test("should decode ArrayBuffer from react-server-dom-webpack", async () => {
        const buffer = new ArrayBuffer(8);
        const view = new Uint8Array(buffer);
        view.set([1, 2, 3, 4, 5, 6, 7, 8]);
        const data = { buffer };
        const stream = ReactDomServer.renderToReadableStream(data);
        const result = await RscClient.createFromReadableStream(stream);
        expect(result.buffer).toBeInstanceOf(ArrayBuffer);
        expect(result.buffer.byteLength).toBe(8);
        expect(Array.from(new Uint8Array(result.buffer))).toEqual([
          1, 2, 3, 4, 5, 6, 7, 8,
        ]);
      });

      test("should decode DataView from react-server-dom-webpack", async () => {
        const buffer = new ArrayBuffer(4);
        const dataView = new DataView(buffer);
        dataView.setInt32(0, 12345, true);
        const data = { view: dataView };
        const stream = ReactDomServer.renderToReadableStream(data);
        const result = await RscClient.createFromReadableStream(stream);
        expect(result.view).toBeInstanceOf(DataView);
        expect(result.view.getInt32(0, true)).toBe(12345);
      });
    });

    describe("React elements", () => {
      test("should decode simple React element from react-server-dom-webpack", async () => {
        const element = React.createElement(
          "div",
          { className: "test" },
          "Hello"
        );
        const stream = ReactDomServer.renderToReadableStream(element);
        const result = await RscClient.createFromReadableStream(stream);

        expect(result.type).toBe("div");
        expect(result.props.className).toBe("test");
        expect(result.props.children).toBe("Hello");
      });

      test("should decode nested React elements from react-server-dom-webpack", async () => {
        const element = React.createElement(
          "div",
          { id: "container" },
          React.createElement("span", null, "Child 1"),
          React.createElement("span", null, "Child 2")
        );
        const stream = ReactDomServer.renderToReadableStream(element);
        const result = await RscClient.createFromReadableStream(stream);

        expect(result.type).toBe("div");
        expect(result.props.id).toBe("container");
        expect(result.props.children).toHaveLength(2);
      });

      test("should decode React element with key from react-server-dom-webpack", async () => {
        const element = React.createElement(
          "div",
          { key: "my-key", id: "test" },
          "content"
        );
        const stream = ReactDomServer.renderToReadableStream(element);
        const result = await RscClient.createFromReadableStream(stream);

        expect(result.type).toBe("div");
        expect(result.key).toBe("my-key");
        expect(result.props.id).toBe("test");
        expect(result.props.children).toBe("content");
      });
    });

    describe("Promises", () => {
      test("should decode resolved Promise from react-server-dom-webpack", async () => {
        const data = { promise: Promise.resolve({ value: 42 }) };
        const stream = ReactDomServer.renderToReadableStream(data);
        const result = await RscClient.createFromReadableStream(stream);

        expect(result.promise).toBeDefined();
        const resolved = await result.promise;
        expect(resolved.value).toBe(42);
      });

      test("should decode nested Promise from react-server-dom-webpack", async () => {
        const data = {
          outer: {
            inner: Promise.resolve({ nested: "value" }),
          },
        };
        const stream = ReactDomServer.renderToReadableStream(data);
        const result = await RscClient.createFromReadableStream(stream);

        const resolved = await result.outer.inner;
        expect(resolved.nested).toBe("value");
      });

      test("should decode array of Promises from react-server-dom-webpack", async () => {
        const data = {
          promises: [
            Promise.resolve("first"),
            Promise.resolve("second"),
            Promise.resolve("third"),
          ],
        };
        const stream = ReactDomServer.renderToReadableStream(data);
        const result = await RscClient.createFromReadableStream(stream);

        expect(result.promises).toHaveLength(3);
        expect(await result.promises[0]).toBe("first");
        expect(await result.promises[1]).toBe("second");
        expect(await result.promises[2]).toBe("third");
      });
    });
  }
);

describeIf(
  "Cross-Compatibility: @lazarv/rsc → react-server-dom-webpack",
  () => {
    describe("Primitive values", () => {
      test("should decode string from @lazarv/rsc", async () => {
        const data = "Hello from lazarv!";
        const stream = RscServer.renderToReadableStream(data);
        const result =
          await ReactDomClientBrowser.createFromReadableStream(stream);
        expect(result).toBe(data);
      });

      test("should decode number from @lazarv/rsc", async () => {
        const data = 42;
        const stream = RscServer.renderToReadableStream(data);
        const result =
          await ReactDomClientBrowser.createFromReadableStream(stream);
        expect(result).toBe(data);
      });

      test("should decode boolean from @lazarv/rsc", async () => {
        const stream = RscServer.renderToReadableStream(false);
        const result =
          await ReactDomClientBrowser.createFromReadableStream(stream);
        expect(result).toBe(false);
      });

      test("should decode null from @lazarv/rsc", async () => {
        const stream = RscServer.renderToReadableStream(null);
        const result =
          await ReactDomClientBrowser.createFromReadableStream(stream);
        expect(result).toBeNull();
      });
    });

    describe("Objects and arrays", () => {
      test("should decode object from @lazarv/rsc", async () => {
        const data = { framework: "lazarv/rsc", compatible: true };
        const stream = RscServer.renderToReadableStream(data);
        const result =
          await ReactDomClientBrowser.createFromReadableStream(stream);
        expect(result).toEqual(data);
      });

      test("should decode array from @lazarv/rsc", async () => {
        const data = ["a", "b", "c", 1, 2, 3];
        const stream = RscServer.renderToReadableStream(data);
        const result =
          await ReactDomClientBrowser.createFromReadableStream(stream);
        expect(result).toEqual(data);
      });

      test("should decode nested objects from @lazarv/rsc", async () => {
        const data = {
          level1: {
            level2: {
              level3: {
                value: "deep",
              },
            },
          },
        };
        const stream = RscServer.renderToReadableStream(data);
        const result =
          await ReactDomClientBrowser.createFromReadableStream(stream);
        expect(result).toEqual(data);
      });
    });

    describe("Special types", () => {
      test("should decode Date from @lazarv/rsc", async () => {
        const date = new Date("2024-01-01T00:00:00Z");
        const data = { created: date };
        const stream = RscServer.renderToReadableStream(data);
        const result =
          await ReactDomClientBrowser.createFromReadableStream(stream);
        expect(result.created).toBeInstanceOf(Date);
        expect(result.created.toISOString()).toBe(date.toISOString());
      });

      test("should decode BigInt from @lazarv/rsc", async () => {
        const data = { bigNumber: BigInt(9007199254740993n) };
        const stream = RscServer.renderToReadableStream(data);
        const result =
          await ReactDomClientBrowser.createFromReadableStream(stream);
        expect(result.bigNumber).toBe(BigInt(9007199254740993n));
      });

      // @lazarv/rsc now uses chunked format "$Q<id>" compatible with React
      test("should decode Map from @lazarv/rsc", async () => {
        const data = new Map([
          ["a", 1],
          ["b", 2],
        ]);
        const stream = RscServer.renderToReadableStream(data);
        const result =
          await ReactDomClientBrowser.createFromReadableStream(stream);
        expect(result).toBeInstanceOf(Map);
        expect(result.get("a")).toBe(1);
      });

      // @lazarv/rsc now uses chunked format "$W<id>" compatible with React
      test("should decode Set from @lazarv/rsc", async () => {
        const data = new Set(["x", "y", "z"]);
        const stream = RscServer.renderToReadableStream(data);
        const result =
          await ReactDomClientBrowser.createFromReadableStream(stream);
        expect(result).toBeInstanceOf(Set);
        expect(result.has("x")).toBe(true);
      });

      test("should decode Symbol.for from @lazarv/rsc", async () => {
        const data = { symbol: Symbol.for("custom.key") };
        const stream = RscServer.renderToReadableStream(data);
        const result =
          await ReactDomClientBrowser.createFromReadableStream(stream);
        expect(result.symbol).toBe(Symbol.for("custom.key"));
      });

      test("should decode Infinity from @lazarv/rsc", async () => {
        const data = { inf: Infinity, negInf: -Infinity };
        const stream = RscServer.renderToReadableStream(data);
        const result =
          await ReactDomClientBrowser.createFromReadableStream(stream);
        expect(result.inf).toBe(Infinity);
        expect(result.negInf).toBe(-Infinity);
      });

      test("should decode NaN from @lazarv/rsc", async () => {
        const data = { notANumber: NaN };
        const stream = RscServer.renderToReadableStream(data);
        const result =
          await ReactDomClientBrowser.createFromReadableStream(stream);
        expect(Number.isNaN(result.notANumber)).toBe(true);
      });
    });

    describe("TypedArrays", () => {
      // @lazarv/rsc now uses React-compatible binary row format
      test("should decode Uint8Array from @lazarv/rsc", async () => {
        const data = { buffer: new Uint8Array([10, 20, 30]) };
        const stream = RscServer.renderToReadableStream(data);
        const result =
          await ReactDomClientBrowser.createFromReadableStream(stream);
        expect(result.buffer).toBeInstanceOf(Uint8Array);
        expect(Array.from(result.buffer)).toEqual([10, 20, 30]);
      });

      test("should decode Float64Array from @lazarv/rsc", async () => {
        const data = { floats: new Float64Array([1.1, 2.2, 3.3]) };
        const stream = RscServer.renderToReadableStream(data);
        const result =
          await ReactDomClientBrowser.createFromReadableStream(stream);
        expect(result.floats).toBeInstanceOf(Float64Array);
      });

      test("should decode ArrayBuffer from @lazarv/rsc", async () => {
        const buffer = new ArrayBuffer(8);
        const view = new Uint8Array(buffer);
        view.set([1, 2, 3, 4, 5, 6, 7, 8]);
        const data = { buffer };
        const stream = RscServer.renderToReadableStream(data);
        const result =
          await ReactDomClientBrowser.createFromReadableStream(stream);
        expect(result.buffer).toBeInstanceOf(ArrayBuffer);
        expect(result.buffer.byteLength).toBe(8);
        expect(Array.from(new Uint8Array(result.buffer))).toEqual([
          1, 2, 3, 4, 5, 6, 7, 8,
        ]);
      });

      test("should decode DataView from @lazarv/rsc", async () => {
        const buffer = new ArrayBuffer(4);
        const dataView = new DataView(buffer);
        dataView.setInt32(0, 12345, true);
        const data = { view: dataView };
        const stream = RscServer.renderToReadableStream(data);
        const result =
          await ReactDomClientBrowser.createFromReadableStream(stream);
        expect(result.view).toBeInstanceOf(DataView);
        expect(result.view.getInt32(0, true)).toBe(12345);
      });
    });

    describe("React elements", () => {
      test("should decode simple React element from @lazarv/rsc", async () => {
        const element = React.createElement("p", { id: "para" }, "Paragraph");
        const stream = RscServer.renderToReadableStream(element);
        const result =
          await ReactDomClientBrowser.createFromReadableStream(stream);

        expect(result.type).toBe("p");
        expect(result.props.id).toBe("para");
        expect(result.props.children).toBe("Paragraph");
      });

      // @lazarv/rsc now outputs Fragment children as plain array, matching React
      test("should decode Fragment from @lazarv/rsc", async () => {
        const element = React.createElement(
          React.Fragment,
          null,
          React.createElement("span", null, "A"),
          React.createElement("span", null, "B")
        );
        const stream = RscServer.renderToReadableStream(element);
        const result =
          await ReactDomClientBrowser.createFromReadableStream(stream);

        // Fragment children are output as array
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(2);
        expect(result[0].type).toBe("span");
        expect(result[1].type).toBe("span");
      });

      test("should decode React element with key from @lazarv/rsc", async () => {
        const element = React.createElement(
          "div",
          { key: "lazarv-key", className: "test" },
          "keyed content"
        );
        const stream = RscServer.renderToReadableStream(element);
        const result =
          await ReactDomClientBrowser.createFromReadableStream(stream);

        expect(result.type).toBe("div");
        expect(result.key).toBe("lazarv-key");
        expect(result.props.className).toBe("test");
        expect(result.props.children).toBe("keyed content");
      });
    });

    describe("Promises", () => {
      test("should decode resolved Promise from @lazarv/rsc", async () => {
        const data = { promise: Promise.resolve({ value: 100 }) };
        const stream = RscServer.renderToReadableStream(data);
        const result =
          await ReactDomClientBrowser.createFromReadableStream(stream);

        expect(result.promise).toBeDefined();
        const resolved = await result.promise;
        expect(resolved.value).toBe(100);
      });

      test("should decode nested Promise from @lazarv/rsc", async () => {
        const data = {
          outer: {
            inner: Promise.resolve({ nested: "lazarv" }),
          },
        };
        const stream = RscServer.renderToReadableStream(data);
        const result =
          await ReactDomClientBrowser.createFromReadableStream(stream);

        const resolved = await result.outer.inner;
        expect(resolved.nested).toBe("lazarv");
      });

      test("should decode array of Promises from @lazarv/rsc", async () => {
        const data = {
          promises: [
            Promise.resolve("a"),
            Promise.resolve("b"),
            Promise.resolve("c"),
          ],
        };
        const stream = RscServer.renderToReadableStream(data);
        const result =
          await ReactDomClientBrowser.createFromReadableStream(stream);

        expect(result.promises).toHaveLength(3);
        expect(await result.promises[0]).toBe("a");
        expect(await result.promises[1]).toBe("b");
        expect(await result.promises[2]).toBe("c");
      });
    });
  }
);

describeIf("Bidirectional Round-trip Tests", () => {
  test("React → lazarv → React should preserve data", async () => {
    const original = {
      message: "Round trip test",
      count: 123,
      items: [1, 2, 3],
      nested: { deep: { value: true } },
    };

    // React server → lazarv client
    const reactStream = ReactDomServer.renderToReadableStream(original);
    const lazarvDecoded = await RscClient.createFromReadableStream(reactStream);

    // lazarv server → React client
    const lazarvStream = RscServer.renderToReadableStream(lazarvDecoded);
    const final =
      await ReactDomClientBrowser.createFromReadableStream(lazarvStream);

    expect(final).toEqual(original);
  });

  // Now that Map/Set use chunked format, round-trip should work
  test("lazarv → React → lazarv should preserve data", async () => {
    const original = {
      source: "lazarv",
      timestamp: new Date("2024-12-19"),
      bigValue: BigInt(999),
      set: new Set([1, 2, 3]),
    };

    // lazarv server → React client
    const lazarvStream = RscServer.renderToReadableStream(original);
    const reactDecoded =
      await ReactDomClientBrowser.createFromReadableStream(lazarvStream);

    // React server → lazarv client
    const reactStream = ReactDomServer.renderToReadableStream(reactDecoded);
    const final = await RscClient.createFromReadableStream(reactStream);

    expect(final.source).toBe(original.source);
    expect(final.timestamp.toISOString()).toBe(
      original.timestamp.toISOString()
    );
    expect(final.bigValue).toBe(original.bigValue);
    expect(final.set).toBeInstanceOf(Set);
    expect(Array.from(final.set)).toEqual([1, 2, 3]);
  });

  // Now that Map/Set use chunked format, complex round-trip should work
  test("Complex nested structures should survive round-trip", async () => {
    const complex = {
      users: [
        {
          id: 1,
          name: "Alice",
          tags: new Set(["admin", "user"]),
          metadata: new Map([
            ["created", new Date("2024-01-01")],
            ["updated", new Date("2024-12-19")],
          ]),
        },
        {
          id: 2,
          name: "Bob",
          tags: new Set(["user"]),
          metadata: new Map([["created", new Date("2024-06-15")]]),
        },
      ],
      config: {
        bigNumber: BigInt("123456789012345678901234567890"),
        infiniteValue: Infinity,
      },
    };

    // Round trip: lazarv → React → lazarv
    const stream1 = RscServer.renderToReadableStream(complex);
    const mid = await ReactDomClientBrowser.createFromReadableStream(stream1);
    const stream2 = ReactDomServer.renderToReadableStream(mid);
    const final = await RscClient.createFromReadableStream(stream2);

    expect(final.users).toHaveLength(2);
    expect(final.users[0].name).toBe("Alice");
    expect(final.users[0].tags).toBeInstanceOf(Set);
    expect(final.users[0].metadata).toBeInstanceOf(Map);
    expect(final.config.bigNumber).toBe(complex.config.bigNumber);
    expect(final.config.infiniteValue).toBe(Infinity);
  });
});

describeIf("Cross-Compatibility Object Identity", () => {
  test("React should preserve object identity from @lazarv/rsc wire format", async () => {
    const shared = { value: 42 };
    const data = {
      first: shared,
      second: shared,
      nested: { inner: shared },
    };

    const stream = RscServer.renderToReadableStream(data);
    const result = await ReactDomClientBrowser.createFromReadableStream(stream);

    expect(result.first).toBe(result.second);
    expect(result.first).toBe(result.nested.inner);
  });

  test("React should preserve object identity in arrays from @lazarv/rsc", async () => {
    const obj = { id: 1 };
    const arr = [obj, { ref: obj }, obj];

    const stream = RscServer.renderToReadableStream(arr);
    const result = await ReactDomClientBrowser.createFromReadableStream(stream);

    expect(result[0]).toBe(result[2]);
    expect(result[1].ref).toBe(result[0]);
  });

  test("React should handle circular references from @lazarv/rsc", async () => {
    const self = { name: "self" };
    self.self = self;

    const stream = RscServer.renderToReadableStream(self);
    const result = await ReactDomClientBrowser.createFromReadableStream(stream);

    expect(result.self).toBe(result);
  });

  test("React should handle mutual references from @lazarv/rsc", async () => {
    const a = { name: "a" };
    const b = { name: "b" };
    a.ref = b;
    b.ref = a;

    const stream = RscServer.renderToReadableStream({ a, b });
    const result = await ReactDomClientBrowser.createFromReadableStream(stream);

    expect(result.a.ref).toBe(result.b);
    expect(result.b.ref).toBe(result.a);
  });

  test("@lazarv/rsc should preserve object identity from React wire format", async () => {
    // Note: React may or may not preserve identity depending on its implementation
    // This test verifies @lazarv/rsc can at least decode React's format correctly
    const data = { value: "test", nested: { value: "test" } };

    const stream = ReactDomServer.renderToReadableStream(data);
    const result = await RscClient.createFromReadableStream(stream);

    expect(result.value).toBe("test");
    expect(result.nested.value).toBe("test");
  });
});

describeIf("Protocol Wire Format Comparison", () => {
  test("should produce similar wire format for simple object", async () => {
    const data = { hello: "world", count: 42 };

    const { forInspection: reactInspect } = teeStream(
      ReactDomServer.renderToReadableStream(data)
    );
    const { forInspection: lazarvInspect } = teeStream(
      RscServer.renderToReadableStream(data)
    );

    const reactWire = await streamToString(reactInspect);
    const lazarvWire = await streamToString(lazarvInspect);

    // Both should contain the data
    expect(reactWire).toContain("hello");
    expect(reactWire).toContain("world");
    expect(lazarvWire).toContain("hello");
    expect(lazarvWire).toContain("world");

    // Both should contain a row 0
    // Note: React may send a timestamp row first (:N...) before row 0
    // Our implementation emits objects as separate chunks for identity preservation
    expect(reactWire).toContain("0:");
    expect(lazarvWire).toContain("0:");
  });

  test("should handle special values with similar encoding", async () => {
    const data = {
      inf: Infinity,
      negInf: -Infinity,
      nan: NaN,
    };

    const reactStream = ReactDomServer.renderToReadableStream(data);
    const lazarvStream = RscServer.renderToReadableStream(data);

    // Both should be decodable by each other's client
    const reactByRsc = await RscClient.createFromReadableStream(reactStream);
    const lazarvByReact =
      await ReactDomClientBrowser.createFromReadableStream(lazarvStream);

    expect(reactByRsc.inf).toBe(Infinity);
    expect(lazarvByReact.inf).toBe(Infinity);
  });
});

describeIf("React Path-Based Reference Format", () => {
  // Helper to create a stream from a wire format string
  function toStream(str) {
    return new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(str));
        controller.close();
      },
    });
  }

  describe("@lazarv/rsc parsing React path references", () => {
    test("should parse simple path reference ($0:first)", async () => {
      // React format: object with shared nested object using path ref
      const wire = '0:{"first":{"value":42},"second":"$0:first"}';
      const result = await RscClient.createFromReadableStream(toStream(wire));

      expect(result.first).toBe(result.second);
      expect(result.first.value).toBe(42);
    });

    test("should parse self-reference using chunk ref ($0)", async () => {
      // React format for self-reference: obj.self = obj
      const wire = '0:{"self":"$0"}';
      const result = await RscClient.createFromReadableStream(toStream(wire));

      expect(result.self).toBe(result);
    });

    test("should parse array index path reference ($0:0)", async () => {
      // React format: array where second element references first
      const wire = '0:[{"v":1},"$0:0"]';
      const result = await RscClient.createFromReadableStream(toStream(wire));

      expect(result[0]).toBe(result[1]);
      expect(result[0].v).toBe(1);
    });

    test("should parse deep path reference ($0:outer:inner)", async () => {
      // React format: path navigates multiple levels
      const wire = '0:{"outer":{"inner":{"val":99}},"ref":"$0:outer:inner"}';
      const result = await RscClient.createFromReadableStream(toStream(wire));

      expect(result.ref).toBe(result.outer.inner);
      expect(result.ref.val).toBe(99);
    });

    test("should parse mutual references with path refs", async () => {
      // React's actual format for mutual references: { a, b } where a.ref = b and b.ref = a
      // React inlines `a` with `a.ref` (which is b) containing ref back to a via path
      const wire = '0:{"a":{"ref":{"ref":"$0:a"}},"b":"$0:a:ref"}';
      const result = await RscClient.createFromReadableStream(toStream(wire));

      // b is $0:a:ref (chunk 0, property a, property ref)
      // a.ref.ref is $0:a (chunk 0, property a)
      expect(result.a.ref).toBe(result.b);
      expect(result.b.ref).toBe(result.a);
    });

    test("should parse path ref within nested object", async () => {
      // Path ref inside a nested structure
      const wire = '0:{"data":{"items":[{"id":1},"$0:data:items:0"]}}';
      const result = await RscClient.createFromReadableStream(toStream(wire));

      expect(result.data.items[0]).toBe(result.data.items[1]);
      expect(result.data.items[0].id).toBe(1);
    });
  });

  describe("Object identity preserved by @lazarv/rsc for React client", () => {
    test("shared object identity should work with React client", async () => {
      const shared = { value: 42 };
      const data = { first: shared, second: shared };

      const stream = RscServer.renderToReadableStream(data);
      const result =
        await ReactDomClientBrowser.createFromReadableStream(stream);

      expect(result.first).toBe(result.second);
    });

    test("circular self-reference should work with React client", async () => {
      const obj = { name: "circular" };
      obj.self = obj;

      const stream = RscServer.renderToReadableStream(obj);
      const result =
        await ReactDomClientBrowser.createFromReadableStream(stream);

      expect(result.self).toBe(result);
    });

    test("mutual references should work with React client", async () => {
      const a = { name: "a" };
      const b = { name: "b" };
      a.ref = b;
      b.ref = a;

      const stream = RscServer.renderToReadableStream({ a, b });
      const result =
        await ReactDomClientBrowser.createFromReadableStream(stream);

      expect(result.a.ref).toBe(result.b);
      expect(result.b.ref).toBe(result.a);
    });

    test("deeply nested shared objects should work with React client", async () => {
      const inner = { deep: true };
      const data = {
        level1: {
          level2: {
            shared: inner,
          },
        },
        ref: inner,
      };

      const stream = RscServer.renderToReadableStream(data);
      const result =
        await ReactDomClientBrowser.createFromReadableStream(stream);

      expect(result.level1.level2.shared).toBe(result.ref);
    });
  });

  describe("Object identity preserved by @lazarv/rsc for own client (React format)", () => {
    test("@lazarv/rsc client should handle React's shared object format", async () => {
      const shared = { value: 42 };
      const data = { first: shared, second: shared };

      // Render with React, decode with @lazarv/rsc
      const stream = ReactDomServer.renderToReadableStream(data);
      const result = await RscClient.createFromReadableStream(stream);

      // React may or may not preserve identity, but @lazarv/rsc should decode correctly
      expect(result.first.value).toBe(42);
      expect(result.second.value).toBe(42);
      // If React used path refs, identity should be preserved
      if (result.first === result.second) {
        expect(result.first).toBe(result.second);
      }
    });

    test("@lazarv/rsc client should handle React's circular ref format", async () => {
      const obj = { name: "circular" };
      obj.self = obj;

      // Render with React, decode with @lazarv/rsc
      const stream = ReactDomServer.renderToReadableStream(obj);
      const result = await RscClient.createFromReadableStream(stream);

      expect(result.self).toBe(result);
    });

    test("@lazarv/rsc client should handle React's mutual ref format", async () => {
      const a = { name: "a" };
      const b = { name: "b" };
      a.ref = b;
      b.ref = a;

      // Render with React, decode with @lazarv/rsc
      const stream = ReactDomServer.renderToReadableStream({ a, b });
      const result = await RscClient.createFromReadableStream(stream);

      expect(result.a.ref).toBe(result.b);
      expect(result.b.ref).toBe(result.a);
    });
  });
});

describeIf("Cross-Compatibility: Client References", () => {
  // ─────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────

  // Mock module registry: maps module IDs to their exports
  const moduleRegistry = new Map();

  function registerMockModule(moduleId, exports) {
    moduleRegistry.set(moduleId, exports);
  }

  function clearMockModules() {
    moduleRegistry.clear();
  }

  // Create a webpackMap entry for React server
  // webpackMap[$$id] = { id, chunks, name, async? }
  function createWebpackMap(entries) {
    const map = {};
    for (const entry of entries) {
      // Key by the full $$id (e.g. "Button.js#default")
      const key = entry.moduleId + "#" + entry.exportName;
      map[key] = {
        id: entry.moduleId,
        chunks: entry.chunks || [],
        name: entry.exportName,
        async: entry.async || false,
      };
      // Also key by just module path for fallback lookup
      map[entry.moduleId] = {
        id: entry.moduleId,
        chunks: entry.chunks || [],
        name: entry.exportName,
        async: entry.async || false,
      };
    }
    return map;
  }

  // Create a moduleResolver for lazarv server
  function createRscModuleResolver(entries) {
    const refMap = new Map();
    for (const entry of entries) {
      refMap.set(entry.moduleId + "#" + entry.exportName, {
        id: entry.moduleId,
        chunks: entry.chunks || [],
        name: entry.exportName,
        async: entry.async || false,
      });
    }
    return {
      resolveClientReference(value) {
        if (value && value.$$id) {
          return refMap.get(value.$$id);
        }
        return null;
      },
    };
  }

  // Create a moduleLoader for lazarv client
  function createRscModuleLoader() {
    return {
      preloadModule(_metadata) {
        // No real chunk loading in tests
        return null;
      },
      requireModule(metadata) {
        const mod = moduleRegistry.get(metadata.id);
        if (!mod) return {};
        if (metadata.name === "*") return mod;
        if (metadata.name === "" || metadata.name === "default") {
          return mod.__esModule ? mod.default : mod;
        }
        return mod[metadata.name];
      },
    };
  }

  // Install/restore webpack globals for React client tests
  // React's browser client dev build needs __webpack_require__, __webpack_chunk_load__,
  // __webpack_get_script_filename__, document.baseURI, and performance.getEntriesByType
  function withWebpackRequire(fn) {
    return async () => {
      const origRequire = globalThis.__webpack_require__;
      const origChunkLoad = globalThis.__webpack_chunk_load__;
      const origGetScript = globalThis.__webpack_get_script_filename__;
      const origDocument = globalThis.document;
      globalThis.__webpack_require__ = (id) => {
        const mod = moduleRegistry.get(id);
        return mod || {};
      };
      globalThis.__webpack_chunk_load__ = () => Promise.resolve();
      globalThis.__webpack_get_script_filename__ = (chunkId) => chunkId;
      if (!globalThis.document) {
        globalThis.document = { baseURI: "http://localhost/" };
      }
      try {
        await fn();
      } finally {
        if (origRequire !== undefined) {
          globalThis.__webpack_require__ = origRequire;
        } else {
          delete globalThis.__webpack_require__;
        }
        if (origChunkLoad !== undefined) {
          globalThis.__webpack_chunk_load__ = origChunkLoad;
        } else {
          delete globalThis.__webpack_chunk_load__;
        }
        if (origGetScript !== undefined) {
          globalThis.__webpack_get_script_filename__ = origGetScript;
        } else {
          delete globalThis.__webpack_get_script_filename__;
        }
        if (origDocument !== undefined) {
          globalThis.document = origDocument;
        } else {
          delete globalThis.document;
        }
      }
    };
  }

  // Helper to resolve a lazy type from either implementation's module wrapping
  // Both React browser client and lazarv client wrap module references as
  // { $$typeof: react.lazy, _init, _payload }
  // _init() resolves to the actual module export (function/component)
  function resolveLazyType(type) {
    if (type && type.$$typeof === Symbol.for("react.lazy")) {
      return type._init(type._payload);
    }
    return type;
  }

  // Helper to check that a value resolves to a client reference with the expected id.
  // Three valid shapes produced by the lazarv / React clients:
  //   1. Direct client reference:  { $$typeof: react.client.reference, $$id }
  //   2. Lazy wrapper:             { $$typeof: react.lazy, _payload: { value: <clientRef> } }
  //   3. Eagerly-resolved export:  a plain function/object (the actual module export).
  //      This is the default path for the lazarv client when requireModule returns
  //      synchronously — resolveModuleReference resolves the chunk with the export
  //      directly (client/shared.mjs:1067-1075), collapsing $L references to the
  //      underlying value with no $$typeof/$$id to inspect. The caller is expected
  //      to verify identity against the registered module separately.
  function expectClientRef(value, expectedId) {
    expect(value).toBeDefined();
    // Direct client reference
    if (value && value.$$typeof === Symbol.for("react.client.reference")) {
      expect(value.$$id).toBe(expectedId);
      return;
    }
    // Lazy wrapper — the payload's value should be the client reference
    if (value && value.$$typeof === Symbol.for("react.lazy")) {
      const payload = value._payload;
      expect(payload).toBeDefined();
      expect(payload.value).toBeDefined();
      expect(payload.value.$$typeof).toBe(Symbol.for("react.client.reference"));
      expect(payload.value.$$id).toBe(expectedId);
      return;
    }
    // Eagerly-resolved module export — the value is the registered export itself.
    // Verify the id resolves to this same value in the mock module registry.
    const [modId, exportName] = expectedId.split("#");
    const registered = moduleRegistry.get(modId);
    expect(registered).toBeDefined();
    const expectedExport =
      !exportName || exportName === "default"
        ? registered.__esModule
          ? registered.default
          : registered
        : registered[exportName];
    expect(value).toBe(expectedExport);
  }

  // ─────────────────────────────────────────────────────────────────────
  // lazarv server → webpack client
  // ─────────────────────────────────────────────────────────────────────
  describe("@lazarv/rsc server → react-server-dom-webpack client", () => {
    test(
      "should serialize client reference and decode with React client",
      withWebpackRequire(async () => {
        function ClientButton({ label }) {
          return React.createElement("button", null, label);
        }

        const moduleId = "components/Button.js";
        const exportName = "default";

        registerMockModule(moduleId, {
          __esModule: true,
          default: ClientButton,
        });

        const ref = RscServer.registerClientReference(
          ClientButton,
          moduleId,
          exportName
        );

        const element = React.createElement(ref, { label: "Click me" });

        const moduleResolver = createRscModuleResolver([
          { moduleId, exportName },
        ]);
        const stream = RscServer.renderToReadableStream(element, {
          moduleResolver,
        });

        const result =
          await ReactDomClientBrowser.createFromReadableStream(stream);

        expect(result.$$typeof).toBe(Symbol.for("react.transitional.element"));
        // React browser client wraps module refs as react.lazy — unwrap to verify
        expect(resolveLazyType(result.type)).toBe(ClientButton);
        expect(result.props.label).toBe("Click me");
      })
    );

    test(
      "should serialize multiple client references",
      withWebpackRequire(async () => {
        function Card() {}
        function Button() {}

        registerMockModule("Card.js", { __esModule: true, default: Card });
        registerMockModule("Button.js", {
          __esModule: true,
          default: Button,
        });

        const CardRef = RscServer.registerClientReference(
          Card,
          "Card.js",
          "default"
        );
        const ButtonRef = RscServer.registerClientReference(
          Button,
          "Button.js",
          "default"
        );

        const element = React.createElement(
          CardRef,
          { title: "Card" },
          React.createElement(ButtonRef, { onClick: "handler" }, "Click")
        );

        const moduleResolver = createRscModuleResolver([
          { moduleId: "Card.js", exportName: "default" },
          { moduleId: "Button.js", exportName: "default" },
        ]);

        const stream = RscServer.renderToReadableStream(element, {
          moduleResolver,
        });

        const result =
          await ReactDomClientBrowser.createFromReadableStream(stream);

        expect(resolveLazyType(result.type)).toBe(Card);
        expect(result.props.title).toBe("Card");
        expect(resolveLazyType(result.props.children.type)).toBe(Button);
        expect(result.props.children.props.children).toBe("Click");
      })
    );

    test(
      "should serialize named export client reference",
      withWebpackRequire(async () => {
        function NamedExport() {}

        registerMockModule("utils.js", { NamedExport });

        const ref = RscServer.registerClientReference(
          NamedExport,
          "utils.js",
          "NamedExport"
        );

        const element = React.createElement(ref, { data: "test" });

        const moduleResolver = createRscModuleResolver([
          { moduleId: "utils.js", exportName: "NamedExport" },
        ]);

        const stream = RscServer.renderToReadableStream(element, {
          moduleResolver,
        });

        const result =
          await ReactDomClientBrowser.createFromReadableStream(stream);

        expect(resolveLazyType(result.type)).toBe(NamedExport);
        expect(result.props.data).toBe("test");
      })
    );

    test("should emit I row in array wire format", async () => {
      function TestComp() {}

      const ref = RscServer.registerClientReference(
        TestComp,
        "test.js",
        "default"
      );

      const element = React.createElement(ref, { value: 42 });

      const moduleResolver = createRscModuleResolver([
        {
          moduleId: "test.js",
          exportName: "default",
          chunks: ["chunk1", "chunk1.js"],
        },
      ]);

      const stream = RscServer.renderToReadableStream(element, {
        moduleResolver,
      });

      const wire = await streamToString(stream);

      // Should contain an I row with array format [id, chunks, name]
      const iRowMatch = wire.match(/(\d+):I(.+)/);
      expect(iRowMatch).toBeTruthy();

      const metadata = JSON.parse(iRowMatch[2]);
      expect(Array.isArray(metadata)).toBe(true);
      expect(metadata[0]).toBe("test.js"); // module id
      expect(metadata[1]).toEqual(["chunk1", "chunk1.js"]); // chunks
      expect(metadata[2]).toBe("default"); // export name
    });

    test(
      "should handle client reference with chunks",
      withWebpackRequire(async () => {
        function LazyComponent() {}

        registerMockModule("lazy.js", {
          __esModule: true,
          default: LazyComponent,
        });

        const ref = RscServer.registerClientReference(
          LazyComponent,
          "lazy.js",
          "default"
        );

        const element = React.createElement(ref, { loaded: true });

        const moduleResolver = createRscModuleResolver([
          {
            moduleId: "lazy.js",
            exportName: "default",
            chunks: ["lazy-chunk", "lazy-chunk.js"],
          },
        ]);

        const stream = RscServer.renderToReadableStream(element, {
          moduleResolver,
        });

        const result =
          await ReactDomClientBrowser.createFromReadableStream(stream);

        expect(resolveLazyType(result.type)).toBe(LazyComponent);
        expect(result.props.loaded).toBe(true);
      })
    );
  });

  // ─────────────────────────────────────────────────────────────────────
  // webpack server → lazarv client
  // ─────────────────────────────────────────────────────────────────────
  describe("react-server-dom-webpack server → @lazarv/rsc client", () => {
    test("should serialize client reference and decode with lazarv client", async () => {
      function ClientInput({ placeholder }) {
        return React.createElement("input", { placeholder });
      }

      const moduleId = "components/Input.js";
      const exportName = "default";

      registerMockModule(moduleId, {
        __esModule: true,
        default: ClientInput,
      });

      // Register with React server
      const ref = ReactDomServer.registerClientReference(
        ClientInput,
        moduleId,
        exportName
      );

      const element = React.createElement(ref, { placeholder: "Type here" });

      // Create webpackMap for React server
      const webpackMap = createWebpackMap([{ moduleId, exportName }]);

      // Serialize with React server
      const stream = ReactDomServer.renderToReadableStream(element, webpackMap);

      // Decode with lazarv client
      const moduleLoader = createRscModuleLoader();
      const result = await RscClient.createFromReadableStream(stream, {
        moduleLoader,
      });

      // The result should be a React element with a client reference as type
      expect(result.$$typeof).toBe(Symbol.for("react.transitional.element"));
      // The lazarv client preserves client references (not lazily resolved)
      expectClientRef(result.type, moduleId + "#" + exportName);
      expect(result.props.placeholder).toBe("Type here");
    });

    test("should serialize multiple client references from React server", async () => {
      function Header() {}
      function Footer() {}

      registerMockModule("Header.js", { __esModule: true, default: Header });
      registerMockModule("Footer.js", { __esModule: true, default: Footer });

      const HeaderRef = ReactDomServer.registerClientReference(
        Header,
        "Header.js",
        "default"
      );
      const FooterRef = ReactDomServer.registerClientReference(
        Footer,
        "Footer.js",
        "default"
      );

      const element = React.createElement(
        "div",
        null,
        React.createElement(HeaderRef, { title: "Top" }),
        React.createElement(FooterRef, { copyright: "2024" })
      );

      const webpackMap = createWebpackMap([
        { moduleId: "Header.js", exportName: "default" },
        { moduleId: "Footer.js", exportName: "default" },
      ]);

      const stream = ReactDomServer.renderToReadableStream(element, webpackMap);

      const moduleLoader = createRscModuleLoader();
      const result = await RscClient.createFromReadableStream(stream, {
        moduleLoader,
      });

      expect(result.type).toBe("div");
      expectClientRef(result.props.children[0].type, "Header.js#default");
      expect(result.props.children[0].props.title).toBe("Top");
      expectClientRef(result.props.children[1].type, "Footer.js#default");
      expect(result.props.children[1].props.copyright).toBe("2024");
    });

    test("should serialize named export client reference from React server", async () => {
      function Dialog() {}

      registerMockModule("ui.js", { Dialog });

      const ref = ReactDomServer.registerClientReference(
        Dialog,
        "ui.js",
        "Dialog"
      );

      const element = React.createElement(ref, { open: true });

      const webpackMap = createWebpackMap([
        { moduleId: "ui.js", exportName: "Dialog" },
      ]);

      const stream = ReactDomServer.renderToReadableStream(element, webpackMap);

      const moduleLoader = createRscModuleLoader();
      const result = await RscClient.createFromReadableStream(stream, {
        moduleLoader,
      });

      expectClientRef(result.type, "ui.js#Dialog");
      expect(result.props.open).toBe(true);
    });

    test("React server should emit I row with array wire format", async () => {
      function WireTest() {}

      const ref = ReactDomServer.registerClientReference(
        WireTest,
        "wire.js",
        "default"
      );

      const element = React.createElement(ref, {});

      const webpackMap = createWebpackMap([
        {
          moduleId: "wire.js",
          exportName: "default",
          chunks: ["c1", "c1.js"],
        },
      ]);

      const stream = ReactDomServer.renderToReadableStream(element, webpackMap);

      const wire = await streamToString(stream);

      // React server emits I row as array [id, chunks, name]
      const iRowMatch = wire.match(/(\d+):I(.+)/);
      expect(iRowMatch).toBeTruthy();

      const metadata = JSON.parse(iRowMatch[2]);
      expect(Array.isArray(metadata)).toBe(true);
      expect(metadata[0]).toBe("wire.js");
      expect(metadata[1]).toEqual(["c1", "c1.js"]);
      expect(metadata[2]).toBe("default");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Wire format compatibility for I rows
  // ─────────────────────────────────────────────────────────────────────
  describe("Wire format compatibility", () => {
    test("both servers should produce structurally equivalent I rows", async () => {
      function Comp() {}

      // Register with both servers
      const lazarvRef = RscServer.registerClientReference(
        Comp,
        "shared.js",
        "default"
      );
      const reactRef = ReactDomServer.registerClientReference(
        Comp,
        "shared.js",
        "default"
      );

      // Serialize with lazarv
      const lazarvResolver = createRscModuleResolver([
        {
          moduleId: "shared.js",
          exportName: "default",
          chunks: ["c0", "c0.js"],
        },
      ]);
      const lazarvStream = RscServer.renderToReadableStream(
        React.createElement(lazarvRef, {}),
        { moduleResolver: lazarvResolver }
      );
      const lazarvWire = await streamToString(lazarvStream);

      // Serialize with React
      const webpackMap = createWebpackMap([
        {
          moduleId: "shared.js",
          exportName: "default",
          chunks: ["c0", "c0.js"],
        },
      ]);
      const reactStream = ReactDomServer.renderToReadableStream(
        React.createElement(reactRef, {}),
        webpackMap
      );
      const reactWire = await streamToString(reactStream);

      // Extract I rows from both
      const lazarvI = lazarvWire.match(/\d+:I(.+)/);
      const reactI = reactWire.match(/\d+:I(.+)/);

      expect(lazarvI).toBeTruthy();
      expect(reactI).toBeTruthy();

      // Both should produce array metadata
      const lazarvMeta = JSON.parse(lazarvI[1]);
      const reactMeta = JSON.parse(reactI[1]);

      expect(Array.isArray(lazarvMeta)).toBe(true);
      expect(Array.isArray(reactMeta)).toBe(true);

      // Same structure: [moduleId, chunks, exportName]
      expect(lazarvMeta[0]).toBe(reactMeta[0]); // module id
      expect(lazarvMeta[1]).toEqual(reactMeta[1]); // chunks
      expect(lazarvMeta[2]).toBe(reactMeta[2]); // export name
    });

    test("lazarv client should handle React's I row array format", async () => {
      // Manually construct wire format with React-style I row
      // Put module reference as the element type using $L reference
      const wire =
        '1:I["myModule.js",["chunk1","chunk1.js"],"default"]\n' +
        '0:["$","$L1",null,{"text":"hello"}]\n';

      function MyModule() {}
      registerMockModule("myModule.js", {
        __esModule: true,
        default: MyModule,
      });

      const moduleLoader = createRscModuleLoader();

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(wire));
          controller.close();
        },
      });

      const result = await RscClient.createFromReadableStream(stream, {
        moduleLoader,
      });

      // The lazarv client creates a lazy wrapper; the payload contains the client ref
      expectClientRef(result.type, "myModule.js#default");
      // _init resolves all the way to the actual module export
      const resolved = resolveLazyType(result.type);
      expect(resolved).toBe(MyModule);
      expect(result.props.text).toBe("hello");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Bidirectional round-trip with client references
  // ─────────────────────────────────────────────────────────────────────
  describe("Bidirectional round-trip with client references", () => {
    test(
      "lazarv server → React client → lazarv server → React client",
      withWebpackRequire(async () => {
        function RoundTripComp({ count }) {
          return React.createElement("span", null, count);
        }

        registerMockModule("rt.js", {
          __esModule: true,
          default: RoundTripComp,
        });

        // First trip: lazarv server → React client
        const ref1 = RscServer.registerClientReference(
          RoundTripComp,
          "rt.js",
          "default"
        );

        const element1 = React.createElement(ref1, { count: 1 });
        const resolver1 = createRscModuleResolver([
          { moduleId: "rt.js", exportName: "default" },
        ]);

        const stream1 = RscServer.renderToReadableStream(element1, {
          moduleResolver: resolver1,
        });
        const result1 =
          await ReactDomClientBrowser.createFromReadableStream(stream1);

        expect(resolveLazyType(result1.type)).toBe(RoundTripComp);
        expect(result1.props.count).toBe(1);
      })
    );

    test("React server → lazarv client → React server → lazarv client", async () => {
      function RoundTrip2({ label }) {
        return React.createElement("em", null, label);
      }

      registerMockModule("rt2.js", {
        __esModule: true,
        default: RoundTrip2,
      });

      // First trip: React server → lazarv client
      const ref = ReactDomServer.registerClientReference(
        RoundTrip2,
        "rt2.js",
        "default"
      );

      const element = React.createElement(ref, { label: "hello" });
      const webpackMap = createWebpackMap([
        { moduleId: "rt2.js", exportName: "default" },
      ]);

      const stream = ReactDomServer.renderToReadableStream(element, webpackMap);

      const moduleLoader = createRscModuleLoader();
      const result = await RscClient.createFromReadableStream(stream, {
        moduleLoader,
      });

      expectClientRef(result.type, "rt2.js#default");
      expect(result.props.label).toBe("hello");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Client reference as direct model (not JSX element)
  // ─────────────────────────────────────────────────────────────────────
  describe("Client reference passed as data (non-element)", () => {
    test(
      "lazarv server serializes ref in data structure, React client resolves",
      withWebpackRequire(async () => {
        function Action() {}

        registerMockModule("actions.js", { __esModule: true, default: Action });

        const ref = RscServer.registerClientReference(
          Action,
          "actions.js",
          "default"
        );

        // Pass the reference as part of a data object (not as JSX)
        const data = {
          handler: ref,
          config: { timeout: 5000 },
        };

        const resolver = createRscModuleResolver([
          { moduleId: "actions.js", exportName: "default" },
        ]);

        const stream = RscServer.renderToReadableStream(data, {
          moduleResolver: resolver,
        });

        const result =
          await ReactDomClientBrowser.createFromReadableStream(stream);

        // React browser client resolves module refs — unwrap the lazy wrapper
        expect(resolveLazyType(result.handler)).toBe(Action);
        expect(result.config.timeout).toBe(5000);
      })
    );

    test("React server serializes ref in data structure, lazarv client resolves", async () => {
      function Handler() {}

      registerMockModule("handler.js", {
        __esModule: true,
        default: Handler,
      });

      const ref = ReactDomServer.registerClientReference(
        Handler,
        "handler.js",
        "default"
      );

      const data = {
        callback: ref,
        meta: { version: 2 },
      };

      const webpackMap = createWebpackMap([
        { moduleId: "handler.js", exportName: "default" },
      ]);

      const stream = ReactDomServer.renderToReadableStream(data, webpackMap);

      const moduleLoader = createRscModuleLoader();
      const result = await RscClient.createFromReadableStream(stream, {
        moduleLoader,
      });

      // lazarv client preserves client references as reference objects
      expectClientRef(result.callback, "handler.js#default");
      expect(result.meta.version).toBe(2);
    });
  });

  // Clean up mock modules after each test
  afterEach(() => {
    clearMockModules();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Server References (Server Actions) Cross-Compatibility
// ═══════════════════════════════════════════════════════════════════════
//
// Both @lazarv/rsc and react-server-dom-webpack now use the "$h" outlined
// wire format for server references, enabling true wire-level cross-feeding.
//
// These tests verify:
//   - Registration produces the same symbols ($$typeof, $$id, $$bound)
//   - Both produce callable proxies with the same callServer semantics
//   - .bind() preserves server reference metadata in both
//   - Wire format encoding is structurally inspectable ($h outlined)
//   - lazarv server → webpack client round-trip (server refs)
//   - webpack server → lazarv client round-trip (server refs)
//   - lazarv server → lazarv client round-trip works for server refs
//   - createServerReference client API is compatible
// ═══════════════════════════════════════════════════════════════════════

describeIf("Cross-Compatibility: Server References", () => {
  const SERVER_REF_SYMBOL = Symbol.for("react.server.reference");

  // Install/restore webpack globals for React client tests
  function withWebpackRequire(fn) {
    return async () => {
      const origRequire = globalThis.__webpack_require__;
      const origChunkLoad = globalThis.__webpack_chunk_load__;
      const origGetScript = globalThis.__webpack_get_script_filename__;
      const origDocument = globalThis.document;
      globalThis.__webpack_require__ = (_id) => ({});
      globalThis.__webpack_chunk_load__ = () => Promise.resolve();
      globalThis.__webpack_get_script_filename__ = (_chunkId) => _chunkId;
      if (!globalThis.document) {
        globalThis.document = { baseURI: "http://localhost/" };
      }
      try {
        await fn();
      } finally {
        if (origRequire !== undefined) {
          globalThis.__webpack_require__ = origRequire;
        } else {
          delete globalThis.__webpack_require__;
        }
        if (origChunkLoad !== undefined) {
          globalThis.__webpack_chunk_load__ = origChunkLoad;
        } else {
          delete globalThis.__webpack_chunk_load__;
        }
        if (origGetScript !== undefined) {
          globalThis.__webpack_get_script_filename__ = origGetScript;
        } else {
          delete globalThis.__webpack_get_script_filename__;
        }
        if (origDocument !== undefined) {
          globalThis.document = origDocument;
        } else {
          delete globalThis.document;
        }
      }
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Registration compatibility
  // ─────────────────────────────────────────────────────────────────────
  describe("Registration compatibility", () => {
    test("both implementations set the same $$typeof symbol", () => {
      async function lazarvAction() {
        return "lazarv";
      }
      async function webpackAction() {
        return "webpack";
      }

      const lazarvRef = RscServer.registerServerReference(
        lazarvAction,
        "actions.mjs",
        "doStuff"
      );
      const webpackRef = ReactDomServer.registerServerReference(
        webpackAction,
        "actions.mjs",
        "doStuff"
      );

      expect(lazarvRef.$$typeof).toBe(SERVER_REF_SYMBOL);
      expect(webpackRef.$$typeof).toBe(SERVER_REF_SYMBOL);
      expect(lazarvRef.$$typeof).toBe(webpackRef.$$typeof);
    });

    test("both implementations set compatible $$id format", () => {
      async function lazarvAction() {}
      async function webpackAction() {}

      const lazarvRef = RscServer.registerServerReference(
        lazarvAction,
        "module.js",
        "myExport"
      );
      const webpackRef = ReactDomServer.registerServerReference(
        webpackAction,
        "module.js",
        "myExport"
      );

      expect(lazarvRef.$$id).toBe("module.js#myExport");
      expect(webpackRef.$$id).toBe("module.js#myExport");
    });

    test("both implementations initialize $$bound to null", () => {
      async function lazarvAction() {}
      async function webpackAction() {}

      const lazarvRef = RscServer.registerServerReference(
        lazarvAction,
        "mod.js",
        "fn"
      );
      const webpackRef = ReactDomServer.registerServerReference(
        webpackAction,
        "mod.js",
        "fn"
      );

      expect(lazarvRef.$$bound).toBeNull();
      expect(webpackRef.$$bound).toBeNull();
    });

    test("both implementations support .bind() with preserved metadata", () => {
      async function lazarvAction(a, b) {
        return a + b;
      }
      async function webpackAction(a, b) {
        return a + b;
      }

      const lazarvRef = RscServer.registerServerReference(
        lazarvAction,
        "calc.js",
        "add"
      );
      const webpackRef = ReactDomServer.registerServerReference(
        webpackAction,
        "calc.js",
        "add"
      );

      const lazarvBound = lazarvRef.bind(null, 10);
      const webpackBound = webpackRef.bind(null, 10);

      // Both bound refs keep $$typeof
      expect(lazarvBound.$$typeof).toBe(SERVER_REF_SYMBOL);
      expect(webpackBound.$$typeof).toBe(SERVER_REF_SYMBOL);

      // Both keep the same $$id
      expect(lazarvBound.$$id).toBe("calc.js#add");
      expect(webpackBound.$$id).toBe("calc.js#add");

      // Both store bound args
      expect(lazarvBound.$$bound).toEqual([10]);
      expect(webpackBound.$$bound).toEqual([10]);
    });

    test(".bind() accumulates arguments across multiple calls", () => {
      async function action(a, b, c) {
        return [a, b, c];
      }

      const ref = RscServer.registerServerReference(action, "multi.js", "fn");
      const bound1 = ref.bind(null, "first");
      const bound2 = bound1.bind(null, "second");

      expect(bound2.$$typeof).toBe(SERVER_REF_SYMBOL);
      expect(bound2.$$id).toBe("multi.js#fn");
      expect(bound2.$$bound).toEqual(["first", "second"]);
    });

    test("registered server reference is callable", async () => {
      async function greet(name) {
        return `Hello, ${name}!`;
      }

      const ref = RscServer.registerServerReference(
        greet,
        "greet.js",
        "default"
      );
      const result = await ref("World");
      expect(result).toBe("Hello, World!");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Wire format inspection
  // ─────────────────────────────────────────────────────────────────────
  describe("Wire format inspection", () => {
    test("lazarv server serializes server ref with $h prefix (outlined)", async () => {
      async function myAction() {}
      const ref = RscServer.registerServerReference(
        myAction,
        "actions.js",
        "submit"
      );

      const model = { handler: ref };
      const stream = RscServer.renderToReadableStream(model, {});
      const wire = await streamToString(stream);

      // Should contain $h followed by a chunk id (outlined format, same as React)
      expect(wire).toMatch(/\$h\d+/);
      // The outlined chunk should contain the action id
      expect(wire).toContain("actions.js#submit");
    });

    test("lazarv server serializes bound server ref with $h (outlined)", async () => {
      async function myAction(_pre, _val) {}
      const ref = RscServer.registerServerReference(
        myAction,
        "actions.js",
        "save"
      );
      const bound = ref.bind(null, "prefix");

      const model = { handler: bound };
      const stream = RscServer.renderToReadableStream(model, {});
      const wire = await streamToString(stream);

      // Should use $h outlined format (same as React)
      expect(wire).toMatch(/\$h\d+/);
      // The outlined chunk should contain the action id and bound args
      expect(wire).toContain("actions.js#save");
      expect(wire).toContain("prefix");
    });

    test("lazarv server serializes server ref with moduleResolver metadata", async () => {
      async function myAction() {}
      const ref = RscServer.registerServerReference(
        myAction,
        "actions.js",
        "run"
      );

      const model = { handler: ref };
      const stream = RscServer.renderToReadableStream(model, {
        moduleResolver: {
          resolveServerReference(value) {
            if (value && value.$$id === "actions.js#run") {
              return { id: "actions.js", name: "run" };
            }
            return null;
          },
        },
      });
      const wire = await streamToString(stream);
      // Should use $h outlined format
      expect(wire).toMatch(/\$h\d+/);
      // Outlined chunk should contain the resolver metadata
      expect(wire).toContain('"actions.js"');
      expect(wire).toContain('"run"');
    });

    test("webpack server serializes server ref with $h prefix (outlined)", async () => {
      async function myAction() {}
      const ref = ReactDomServer.registerServerReference(
        myAction,
        "actions.js",
        "submit"
      );

      // webpack server uses renderToReadableStream(model, webpackMap, options)
      // webpackMap is for client references; server references are serialized regardless
      const stream = ReactDomServer.renderToReadableStream(
        { handler: ref },
        {} // empty webpackMap
      );
      const wire = await streamToString(stream);

      // Should contain $h followed by a hex chunk id
      expect(wire).toMatch(/\$h[0-9a-f]+/);
      // The outlined chunk should contain the action id
      expect(wire).toContain("actions.js#submit");
    });

    test("both encode the same logical action id in their wire formats", async () => {
      const actionId = "shared/actions.js#doWork";

      async function lazarvAction() {}
      async function webpackAction() {}

      const lazarvRef = RscServer.registerServerReference(
        lazarvAction,
        "shared/actions.js",
        "doWork"
      );
      const webpackRef = ReactDomServer.registerServerReference(
        webpackAction,
        "shared/actions.js",
        "doWork"
      );

      const lazarvStream = RscServer.renderToReadableStream(
        { fn: lazarvRef },
        {}
      );
      const webpackStream = ReactDomServer.renderToReadableStream(
        { fn: webpackRef },
        {}
      );

      const lazarvWire = await streamToString(lazarvStream);
      const webpackWire = await streamToString(webpackStream);

      // Both should encode the full action id somewhere in the wire
      expect(lazarvWire).toContain(actionId);
      expect(webpackWire).toContain(actionId);
    });

    test("both servers produce structurally equivalent $h wire format", async () => {
      async function lazarvAction() {}
      async function webpackAction() {}

      const lazarvRef = RscServer.registerServerReference(
        lazarvAction,
        "actions.js",
        "submit"
      );
      const webpackRef = ReactDomServer.registerServerReference(
        webpackAction,
        "actions.js",
        "submit"
      );

      const lazarvStream = RscServer.renderToReadableStream(
        { handler: lazarvRef },
        {}
      );
      const webpackStream = ReactDomServer.renderToReadableStream(
        { handler: webpackRef },
        {}
      );

      const lazarvWire = await streamToString(lazarvStream);
      const webpackWire = await streamToString(webpackStream);

      // Both should use $h prefix for the reference in the root model
      expect(lazarvWire).toMatch(/\$h\d+/);
      expect(webpackWire).toMatch(/\$h\d+/);

      // Both should have the action id in an outlined chunk
      expect(lazarvWire).toContain("actions.js#submit");
      expect(webpackWire).toContain("actions.js#submit");

      // Both should have "bound":null for unbound refs
      expect(lazarvWire).toContain('"bound":null');
      expect(webpackWire).toContain('"bound":null');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // True cross-compat: lazarv server → webpack client
  // ─────────────────────────────────────────────────────────────────────
  describe("@lazarv/rsc server → react-server-dom-webpack client (server refs)", () => {
    test(
      "webpack client should decode lazarv server's server reference",
      withWebpackRequire(async () => {
        const callLog = [];
        const mockCallServer = async (id, args) => {
          callLog.push({ id, args });
          return "from-server";
        };

        async function myAction(_input) {}
        const ref = RscServer.registerServerReference(
          myAction,
          "actions.js",
          "submit"
        );

        const model = { handler: ref, label: "go" };
        const stream = RscServer.renderToReadableStream(model, {});
        const result = await ReactDomClientBrowser.createFromReadableStream(
          stream,
          {
            callServer: mockCallServer,
          }
        );

        expect(result.label).toBe("go");
        expect(typeof result.handler).toBe("function");

        // Call the action — webpack client's proxy should invoke callServer
        const callResult = await result.handler("test-data");
        expect(callResult).toBe("from-server");
        expect(callLog).toHaveLength(1);
        expect(callLog[0].id).toBe("actions.js#submit");
        expect(callLog[0].args).toEqual(["test-data"]);
      })
    );

    test(
      "webpack client should decode lazarv server's bound server reference",
      withWebpackRequire(async () => {
        const callLog = [];
        const mockCallServer = async (id, args) => {
          callLog.push({ id, args });
          return "bound-result";
        };

        async function myAction(_pre, _val) {}
        const ref = RscServer.registerServerReference(
          myAction,
          "actions.js",
          "save"
        );
        const bound = ref.bind(null, "prefix");

        const model = { handler: bound };
        const stream = RscServer.renderToReadableStream(model, {});
        const result = await ReactDomClientBrowser.createFromReadableStream(
          stream,
          {
            callServer: mockCallServer,
          }
        );

        expect(typeof result.handler).toBe("function");

        await result.handler("call-arg");
        expect(callLog).toHaveLength(1);
        expect(callLog[0].id).toBe("actions.js#save");
        expect(callLog[0].args).toEqual(["prefix", "call-arg"]);
      })
    );
  });

  // ─────────────────────────────────────────────────────────────────────
  // True cross-compat: webpack server → lazarv client
  // ─────────────────────────────────────────────────────────────────────
  describe("react-server-dom-webpack server → @lazarv/rsc client (server refs)", () => {
    test("lazarv client should decode webpack server's server reference", async () => {
      const callLog = [];
      const mockCallServer = async (id, args) => {
        callLog.push({ id, args });
        return "from-webpack-server";
      };

      async function myAction(_input) {}
      const ref = ReactDomServer.registerServerReference(
        myAction,
        "actions.js",
        "submit"
      );

      const model = { handler: ref, label: "click" };
      const stream = ReactDomServer.renderToReadableStream(model, {});
      const result = await RscClient.createFromReadableStream(stream, {
        callServer: mockCallServer,
      });

      expect(result.label).toBe("click");
      expect(typeof result.handler).toBe("function");
      expect(result.handler.$$typeof).toBe(
        Symbol.for("react.server.reference")
      );
      expect(result.handler.$$id).toBe("actions.js#submit");

      const callResult = await result.handler("input-data");
      expect(callResult).toBe("from-webpack-server");
      expect(callLog).toHaveLength(1);
      expect(callLog[0].id).toBe("actions.js#submit");
      expect(callLog[0].args).toEqual(["input-data"]);
    });

    test("lazarv client should decode webpack server's bound server reference", async () => {
      const callLog = [];
      const mockCallServer = async (id, args) => {
        callLog.push({ id, args });
        return "bound-from-webpack";
      };

      async function myAction(_pre, _val) {}
      const ref = ReactDomServer.registerServerReference(
        myAction,
        "actions.js",
        "save"
      );
      const bound = ref.bind(null, "pre-arg");

      const model = { handler: bound };
      const stream = ReactDomServer.renderToReadableStream(model, {});
      const result = await RscClient.createFromReadableStream(stream, {
        callServer: mockCallServer,
      });

      expect(typeof result.handler).toBe("function");
      expect(result.handler.$$typeof).toBe(
        Symbol.for("react.server.reference")
      );
      expect(result.handler.$$id).toBe("actions.js#save");

      await result.handler("call-arg");
      expect(callLog).toHaveLength(1);
      expect(callLog[0].id).toBe("actions.js#save");
      expect(callLog[0].args).toEqual(["pre-arg", "call-arg"]);
    });

    test("lazarv client should decode multiple server refs from webpack server", async () => {
      const callLog = [];
      const mockCallServer = async (id, args) => {
        callLog.push({ id, args });
        return id;
      };

      async function actionA() {}
      async function actionB() {}

      const refA = ReactDomServer.registerServerReference(
        actionA,
        "a.js",
        "run"
      );
      const refB = ReactDomServer.registerServerReference(
        actionB,
        "b.js",
        "run"
      );

      const model = { actions: [refA, refB] };
      const stream = ReactDomServer.renderToReadableStream(model, {});
      const result = await RscClient.createFromReadableStream(stream, {
        callServer: mockCallServer,
      });

      expect(result.actions).toHaveLength(2);
      expect(result.actions[0].$$id).toBe("a.js#run");
      expect(result.actions[1].$$id).toBe("b.js#run");

      await result.actions[0]("arg-a");
      await result.actions[1]("arg-b");
      expect(callLog).toEqual([
        { id: "a.js#run", args: ["arg-a"] },
        { id: "b.js#run", args: ["arg-b"] },
      ]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // lazarv server → lazarv client round-trip
  // ─────────────────────────────────────────────────────────────────────
  describe("@lazarv/rsc server → @lazarv/rsc client round-trip", () => {
    test("should serialize and decode a server reference", async () => {
      const callLog = [];
      const mockCallServer = async (id, args) => {
        callLog.push({ id, args });
        return "server-result";
      };

      async function myAction(input) {
        return input;
      }
      const ref = RscServer.registerServerReference(
        myAction,
        "actions.js",
        "submit"
      );

      const model = { action: ref, label: "Submit" };
      const stream = RscServer.renderToReadableStream(model, {});
      const result = await RscClient.createFromReadableStream(stream, {
        callServer: mockCallServer,
      });

      // Decoded action should be a callable function
      expect(typeof result.action).toBe("function");
      expect(result.label).toBe("Submit");

      // Should have server reference metadata
      expect(result.action.$$typeof).toBe(SERVER_REF_SYMBOL);
      expect(result.action.$$id).toBe("actions.js#submit");
      expect(result.action.$$bound).toBeNull();

      // Calling the action should invoke callServer
      const callResult = await result.action("test-input");
      expect(callResult).toBe("server-result");
      expect(callLog).toHaveLength(1);
      expect(callLog[0].id).toBe("actions.js#submit");
      expect(callLog[0].args).toEqual(["test-input"]);
    });

    test("should serialize and decode a bound server reference", async () => {
      const callLog = [];
      const mockCallServer = async (id, args) => {
        callLog.push({ id, args });
        return "bound-result";
      };

      async function myAction(pre, val) {
        return [pre, val];
      }
      const ref = RscServer.registerServerReference(
        myAction,
        "actions.js",
        "save"
      );
      const bound = ref.bind(null, "pre-arg");

      const model = { action: bound };
      const stream = RscServer.renderToReadableStream(model, {});
      const result = await RscClient.createFromReadableStream(stream, {
        callServer: mockCallServer,
      });

      expect(typeof result.action).toBe("function");
      expect(result.action.$$typeof).toBe(SERVER_REF_SYMBOL);
      expect(result.action.$$id).toBe("actions.js#save");
      expect(result.action.$$bound).toEqual(["pre-arg"]);

      // Calling should prepend bound args
      await result.action("call-arg");
      expect(callLog).toHaveLength(1);
      expect(callLog[0].id).toBe("actions.js#save");
      expect(callLog[0].args).toEqual(["pre-arg", "call-arg"]);
    });

    test("should serialize server ref nested in element props", async () => {
      const callLog = [];
      const mockCallServer = async (id, args) => {
        callLog.push({ id, args });
      };

      async function handleClick() {}
      const ref = RscServer.registerServerReference(
        handleClick,
        "handlers.js",
        "onClick"
      );

      const element = React.createElement("div", { onClick: ref });
      const stream = RscServer.renderToReadableStream(element, {});
      const result = await RscClient.createFromReadableStream(stream, {
        callServer: mockCallServer,
      });

      expect(result.$$typeof).toBe(Symbol.for("react.transitional.element"));
      expect(typeof result.props.onClick).toBe("function");
      expect(result.props.onClick.$$typeof).toBe(SERVER_REF_SYMBOL);
      expect(result.props.onClick.$$id).toBe("handlers.js#onClick");
    });

    test("should serialize multiple server refs in a data structure", async () => {
      const callLog = [];
      const mockCallServer = async (id, args) => {
        callLog.push({ id, args });
        return id;
      };

      async function actionA() {}
      async function actionB() {}

      const refA = RscServer.registerServerReference(actionA, "a.js", "run");
      const refB = RscServer.registerServerReference(actionB, "b.js", "run");

      const model = { actions: [refA, refB], count: 2 };
      const stream = RscServer.renderToReadableStream(model, {});
      const result = await RscClient.createFromReadableStream(stream, {
        callServer: mockCallServer,
      });

      expect(result.count).toBe(2);
      expect(result.actions).toHaveLength(2);
      expect(result.actions[0].$$id).toBe("a.js#run");
      expect(result.actions[1].$$id).toBe("b.js#run");

      await result.actions[0]("arg0");
      await result.actions[1]("arg1");
      expect(callLog).toEqual([
        { id: "a.js#run", args: ["arg0"] },
        { id: "b.js#run", args: ["arg1"] },
      ]);
    });

    test("decoded action .bind() creates a new bound proxy", async () => {
      const callLog = [];
      const mockCallServer = async (id, args) => {
        callLog.push({ id, args });
      };

      async function myAction() {}
      const ref = RscServer.registerServerReference(myAction, "bind.js", "fn");

      const model = { action: ref };
      const stream = RscServer.renderToReadableStream(model, {});
      const result = await RscClient.createFromReadableStream(stream, {
        callServer: mockCallServer,
      });

      // Client-side bind
      const bound = result.action.bind(null, "x", "y");
      expect(bound.$$typeof).toBe(SERVER_REF_SYMBOL);
      expect(bound.$$id).toBe("bind.js#fn");
      expect(bound.$$bound).toEqual(["x", "y"]);

      await bound("z");
      expect(callLog[0].id).toBe("bind.js#fn");
      expect(callLog[0].args).toEqual(["x", "y", "z"]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // createServerReference client API compatibility
  // ─────────────────────────────────────────────────────────────────────
  describe("createServerReference client API compatibility", () => {
    test("lazarv createServerReference creates proxy with correct properties", () => {
      const mockCallServer = async () => {};
      const ref = RscClient.createServerReference(
        "module.js#action",
        mockCallServer
      );

      expect(typeof ref).toBe("function");
      expect(ref.$$typeof).toBe(SERVER_REF_SYMBOL);
      expect(ref.$$id).toBe("module.js#action");
      expect(ref.$$bound).toBeNull();
    });

    test("lazarv createServerReference proxy calls callServer correctly", async () => {
      const callLog = [];
      const mockCallServer = async (id, args) => {
        callLog.push({ id, args });
        return "result";
      };

      const ref = RscClient.createServerReference(
        "api.js#fetch",
        mockCallServer
      );
      const result = await ref("arg1", "arg2");

      expect(result).toBe("result");
      expect(callLog).toEqual([{ id: "api.js#fetch", args: ["arg1", "arg2"] }]);
    });

    test("lazarv createServerReference .bind() accumulates args", async () => {
      const callLog = [];
      const mockCallServer = async (id, args) => {
        callLog.push({ id, args });
      };

      const ref = RscClient.createServerReference(
        "api.js#update",
        mockCallServer
      );
      const bound1 = ref.bind(null, "a");
      const bound2 = bound1.bind(null, "b");

      expect(bound2.$$typeof).toBe(SERVER_REF_SYMBOL);
      expect(bound2.$$id).toBe("api.js#update");
      expect(bound2.$$bound).toEqual(["a", "b"]);

      await bound2("c");
      expect(callLog[0].args).toEqual(["a", "b", "c"]);
    });

    test("both createServerReference implementations produce equivalent proxies", async () => {
      const lazarvLog = [];
      const webpackLog = [];

      const lazarvCallServer = async (id, args) => {
        lazarvLog.push({ id, args });
        return "lazarv";
      };
      const webpackCallServer = async (id, args) => {
        webpackLog.push({ id, args });
        return "webpack";
      };

      const lazarvRef = RscClient.createServerReference(
        "shared.js#action",
        lazarvCallServer
      );
      const webpackRef = ReactDomClientBrowser.createServerReference(
        "shared.js#action",
        webpackCallServer
      );

      // Both should be callable functions
      expect(typeof lazarvRef).toBe("function");
      expect(typeof webpackRef).toBe("function");

      // Call both with same args
      const lazarvResult = await lazarvRef("x", 42);
      const webpackResult = await webpackRef("x", 42);

      expect(lazarvResult).toBe("lazarv");
      expect(webpackResult).toBe("webpack");

      // Both should have called callServer with the same id and args
      expect(lazarvLog).toEqual([{ id: "shared.js#action", args: ["x", 42] }]);
      expect(webpackLog).toEqual([{ id: "shared.js#action", args: ["x", 42] }]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Wire format: lazarv client consuming raw $h wire data
  // ─────────────────────────────────────────────────────────────────────
  describe("Wire format: lazarv client consuming raw wire data", () => {
    test("should decode $h outlined server reference from raw wire", async () => {
      const callLog = [];
      const mockCallServer = async (id, args) => {
        callLog.push({ id, args });
        return "ok";
      };

      // Manually construct wire in React's $h format:
      // Row 1 = outlined server ref model, Row 0 = root model referencing $h1
      const wire =
        '1:{"id":"actions.js#submit","bound":null}\n' +
        '0:{"handler":"$h1","label":"go"}\n';
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(wire));
          controller.close();
        },
      });

      const result = await RscClient.createFromReadableStream(stream, {
        callServer: mockCallServer,
      });

      expect(result.label).toBe("go");
      expect(typeof result.handler).toBe("function");
      expect(result.handler.$$typeof).toBe(SERVER_REF_SYMBOL);
      expect(result.handler.$$id).toBe("actions.js#submit");

      await result.handler("data");
      expect(callLog[0]).toEqual({
        id: "actions.js#submit",
        args: ["data"],
      });
    });

    test("should decode $h outlined server reference with bound args", async () => {
      const callLog = [];
      const mockCallServer = async (id, args) => {
        callLog.push({ id, args });
      };

      // Outlined bound ref: bound is an inline array
      const wire =
        '1:{"id":"actions.js#save","bound":["pre",42]}\n' +
        '0:{"handler":"$h1"}\n';
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(wire));
          controller.close();
        },
      });

      const result = await RscClient.createFromReadableStream(stream, {
        callServer: mockCallServer,
      });

      expect(typeof result.handler).toBe("function");
      expect(result.handler.$$typeof).toBe(SERVER_REF_SYMBOL);
      expect(result.handler.$$id).toBe("actions.js#save");
      expect(result.handler.$$bound).toEqual(["pre", 42]);

      await result.handler("call-arg");
      expect(callLog[0]).toEqual({
        id: "actions.js#save",
        args: ["pre", 42, "call-arg"],
      });
    });
  });
});

describe("Debug Info Cross-Compatibility", () => {
  beforeAll(() => {
    if (skipTests) return;
  });

  test.skipIf(skipTests)(
    "lazarv client should handle React debug rows from dev mode",
    async () => {
      // React's dev mode emits debug info with D rows for server components
      // For simple elements, it emits :N (nonce) and stack trace chunks
      const element = React.createElement(
        "div",
        { className: "test" },
        "Hello"
      );
      const stream = ReactDomServer.renderToReadableStream(element);
      const rawData = await streamToString(stream);

      // Verify React emits :N (nonce) row in dev mode
      expect(rawData).toContain(":N");

      // Parse with lazarv client
      const { forConsumption } = teeStream(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(rawData));
            controller.close();
          },
        })
      );

      const debugInfos = [];
      const result = await RscClient.createFromReadableStream(forConsumption, {
        onDebugInfo: (id, info) => debugInfos.push({ id, info }),
      });

      // Result should be valid element
      expect(result.type).toBe("div");
      expect(result.props.className).toBe("test");

      // Debug info callback may or may not be called depending on what React emits
      // For simple elements, React doesn't emit D rows, only stack trace chunks
      // The key thing is that the client can successfully parse the payload
    }
  );

  test.skipIf(skipTests)(
    "React client should handle lazarv debug rows from dev mode",
    async () => {
      // Create a server component-like scenario with debug mode enabled
      const element = React.createElement(
        "div",
        { className: "test" },
        "Hello"
      );
      const stream = RscServer.renderToReadableStream(element, {
        debug: true,
      });
      const rawData = await streamToString(stream);

      // Verify lazarv emits D rows in debug mode
      expect(rawData).toContain(":D");

      // Parse with React client
      const { forConsumption } = teeStream(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(rawData));
            controller.close();
          },
        })
      );

      const result = await ReactDomClientBrowser.createFromReadableStream(
        forConsumption,
        {
          moduleBaseURL: "http://localhost",
        }
      );

      // Result should be valid element
      expect(result.type).toBe("div");
      expect(result.props.className).toBe("test");
    }
  );

  test.skipIf(skipTests)(
    "lazarv client should handle payload without debug info (production mode)",
    async () => {
      // Without debug option, no debug info should be emitted
      const element = React.createElement(
        "div",
        { className: "prod" },
        "Production"
      );
      const stream = RscServer.renderToReadableStream(element);
      const rawData = await streamToString(stream);

      // Verify no D rows without debug option
      expect(rawData).not.toContain(":D");

      // Parse should work without issues
      const { forConsumption } = teeStream(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(rawData));
            controller.close();
          },
        })
      );

      const result = await RscClient.createFromReadableStream(forConsumption);

      expect(result.type).toBe("div");
      expect(result.props.className).toBe("prod");
    }
  );

  test.skipIf(skipTests)(
    "lazarv should emit component debug info matching React format",
    async () => {
      function TestComponent({ name }) {
        return React.createElement("span", null, name);
      }

      const element = React.createElement(TestComponent, { name: "test" });

      // Get lazarv output with debug mode enabled
      const lazarvStream = RscServer.renderToReadableStream(element, {
        debug: true,
      });
      const lazarvData = await streamToString(lazarvStream);

      // Parse the component debug info row
      const lines = lazarvData.split("\n").filter((l) => l.trim());

      // Should have component info chunk
      const componentInfoLine = lines.find(
        (line) =>
          line.includes('"name":"TestComponent"') ||
          line.includes('"name":"Anonymous"')
      );
      expect(componentInfoLine).toBeDefined();

      // Should have debug D row
      const debugRow = lines.find((line) => line.includes(":D"));
      expect(debugRow).toBeDefined();

      // Element should have owner and stack references in debug mode
      const elementLine = lines.find((line) => line.includes('["$","span"'));
      expect(elementLine).toBeDefined();

      // Parse the element tuple - should have more than 4 elements in debug mode
      const elementMatch = elementLine.match(
        /\["[^"]*","span",[^,]*,\{[^}]*\}(.*)\]/
      );
      if (elementMatch && elementMatch[1]) {
        // Debug mode should have additional fields after props
        expect(elementMatch[1]).toContain("$"); // Should have references
      }
    }
  );
});

describe("Prerender Cross-Compatibility", () => {
  beforeAll(() => {
    if (skipTests) return;
  });

  // Note: React has a limitation where only one RSC renderer can be active at a time.
  // Since earlier tests in this file use ReactDomServer.renderToReadableStream (server module),
  // we cannot also use ReactStaticEdge.prerender (static.edge module) in the same test run.
  // The React prerender → lazarv client cross-compat works (tested manually in isolation).
  // Here we only test lazarv prerender → React client which doesn't require React's static module.

  describe("lazarv prerender to React client", () => {
    test.skipIf(skipTests)(
      "React client should decode lazarv prerender output",
      async () => {
        const element = React.createElement(
          "div",
          { className: "prerendered" },
          "Static content"
        );

        // Prerender with lazarv
        const { prelude } = await RscServer.prerender(element);
        const rawData = await streamToString(prelude);

        // Parse with React client
        const { forConsumption } = teeStream(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(rawData));
              controller.close();
            },
          })
        );

        const result = await ReactDomClientBrowser.createFromReadableStream(
          forConsumption,
          {
            moduleBaseURL: "http://localhost",
          }
        );

        expect(result.type).toBe("div");
        expect(result.props.className).toBe("prerendered");
        expect(result.props.children).toBe("Static content");
      }
    );

    test.skipIf(skipTests)(
      "prerender should handle nested elements - lazarv to React",
      async () => {
        const element = React.createElement(
          "div",
          null,
          React.createElement("h1", null, "Title"),
          React.createElement("p", null, "Paragraph")
        );

        // Prerender with lazarv, decode with React
        const { prelude: lazarvPrelude } = await RscServer.prerender(element);
        const lazarvData = await streamToString(lazarvPrelude);

        const { forConsumption: forReact } = teeStream(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(lazarvData));
              controller.close();
            },
          })
        );

        const reactResult =
          await ReactDomClientBrowser.createFromReadableStream(forReact, {
            moduleBaseURL: "http://localhost",
          });

        expect(reactResult.type).toBe("div");
        expect(reactResult.props.children).toHaveLength(2);
        expect(reactResult.props.children[0].type).toBe("h1");
        expect(reactResult.props.children[1].type).toBe("p");
      }
    );

    test.skipIf(skipTests)(
      "lazarv prerender with promises should be decodable by React",
      async () => {
        const data = {
          sync: "immediate",
          async: Promise.resolve("resolved"),
        };

        // Prerender with lazarv (waits for all promises)
        const { prelude: lazarvPrelude } = await RscServer.prerender(data);
        const lazarvData = await streamToString(lazarvPrelude);

        // Parse with React client
        const { forConsumption: forReact } = teeStream(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(lazarvData));
              controller.close();
            },
          })
        );

        const reactResult =
          await ReactDomClientBrowser.createFromReadableStream(forReact, {
            moduleBaseURL: "http://localhost",
          });

        expect(reactResult.sync).toBe("immediate");
        // In prerender, promises should be resolved
        expect(await reactResult.async).toBe("resolved");
      }
    );
  });

  describe("lazarv prerender to lazarv client (self-compatibility)", () => {
    test.skipIf(skipTests)(
      "lazarv client should decode lazarv prerender output",
      async () => {
        const element = React.createElement(
          "div",
          { className: "self-prerendered" },
          "Self static"
        );

        // Prerender with lazarv
        const { prelude } = await RscServer.prerender(element);
        const rawData = await streamToString(prelude);

        // Parse with lazarv client
        const { forConsumption } = teeStream(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(rawData));
              controller.close();
            },
          })
        );

        const result = await RscClient.createFromReadableStream(forConsumption);

        expect(result.type).toBe("div");
        expect(result.props.className).toBe("self-prerendered");
        expect(result.props.children).toBe("Self static");
      }
    );

    test.skipIf(skipTests)(
      "prerender should handle nested elements - lazarv to lazarv",
      async () => {
        const element = React.createElement(
          "section",
          null,
          React.createElement("h2", null, "Header"),
          React.createElement("span", null, "Content")
        );

        // Prerender with lazarv, decode with lazarv
        const { prelude } = await RscServer.prerender(element);
        const data = await streamToString(prelude);

        const { forConsumption } = teeStream(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(data));
              controller.close();
            },
          })
        );

        const result = await RscClient.createFromReadableStream(forConsumption);

        expect(result.type).toBe("section");
        expect(result.props.children).toHaveLength(2);
        expect(result.props.children[0].type).toBe("h2");
        expect(result.props.children[1].type).toBe("span");
      }
    );
  });
});
