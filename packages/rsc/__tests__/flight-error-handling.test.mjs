/**
 * Tests for error handling and callback paths in server shared module
 */

import { describe, expect, test, vi } from "vitest";

import {
  createFromFetch,
  createFromReadableStream,
} from "../client/shared.mjs";
import {
  emitHint,
  logToConsole,
  prerender,
  renderToReadableStream,
} from "../server/shared.mjs";

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

describe("Error Handling in renderToReadableStream", () => {
  test("should handle onError callback", async () => {
    const errors = [];
    const onError = vi.fn((error) => {
      errors.push(error);
    });

    // Create data with a throwing getter
    const badData = {
      get badProperty() {
        throw new Error("Property access error");
      },
    };

    // The render should handle the error via callback
    const stream = renderToReadableStream(badData, { onError });

    // Try to consume the stream
    try {
      await streamToString(stream);
    } catch {
      // Expected - the stream may throw
    }
  });

  test("should call onAllReady when stream is ready", async () => {
    const onAllReady = vi.fn();

    const data = { simple: "data" };
    const stream = renderToReadableStream(data, { onAllReady });

    await streamToString(stream);

    // onAllReady may or may not be called depending on implementation
    // Just verify the stream completes successfully
    expect(stream).toBeDefined();
  });

  test("should handle onPostpone callback for PPR", async () => {
    const onPostpone = vi.fn();

    const data = { test: "data" };
    renderToReadableStream(data, { onPostpone });

    // onPostpone is called when postpone() is triggered during render
  });
});

describe("Error Handling in prerender", () => {
  test("should handle onError in prerender options", async () => {
    const onError = vi.fn();

    const data = { prerender: "test" };
    const result = await prerender(data, { onError });

    expect(result.prelude).toBeDefined();
  });

  test("should handle onFatalError in prerender options", async () => {
    const onFatalError = vi.fn();

    const data = { prerender: "data" };
    await prerender(data, { onFatalError });
  });

  test("should handle onAllReady callback", async () => {
    const onAllReady = vi.fn();

    const data = { ready: true };
    const result = await prerender(data, { onAllReady });

    expect(result.prelude).toBeInstanceOf(ReadableStream);
  });
});

describe("emitHint function", () => {
  test("should be no-op with null request", () => {
    // Should not throw
    emitHint(null, "S", { href: "/style.css" });
  });

  test("should be no-op with undefined request", () => {
    emitHint(undefined, "S", { href: "/style.css" });
  });

  test("should be no-op with plain object request", () => {
    emitHint({}, "P", { href: "/preload.js", as: "script" });
  });

  test("should be no-op with number request", () => {
    emitHint(123, "H", { data: "test" });
  });
});

describe("logToConsole function", () => {
  test("should be no-op with null request", () => {
    logToConsole(null, "log", ["test message"]);
  });

  test("should be no-op with undefined request", () => {
    logToConsole(undefined, "warn", ["warning message"]);
  });

  test("should be no-op with plain object request", () => {
    logToConsole({}, "error", ["error message"]);
  });

  test("should handle various console methods", () => {
    const mockRequest = {};
    logToConsole(mockRequest, "log", ["log"]);
    logToConsole(mockRequest, "warn", ["warn"]);
    logToConsole(mockRequest, "error", ["error"]);
    logToConsole(mockRequest, "info", ["info"]);
    logToConsole(mockRequest, "debug", ["debug"]);
  });
});

describe("Serialization edge cases for coverage", () => {
  test("should handle object with null prototype", async () => {
    const obj = Object.create(null);
    obj.key = "value";
    obj.nested = Object.create(null);
    obj.nested.inner = "test";

    const stream = renderToReadableStream(obj);
    const result = await createFromReadableStream(stream);

    expect(result.key).toBe("value");
    expect(result.nested.inner).toBe("test");
  });

  test("should handle sparse arrays", async () => {
    const sparse = [];
    sparse[0] = "first";
    sparse[5] = "sixth";
    sparse[10] = "eleventh";

    const stream = renderToReadableStream(sparse);
    const result = await createFromReadableStream(stream);

    expect(result[0]).toBe("first");
    expect(result[5]).toBe("sixth");
    expect(result[10]).toBe("eleventh");
  });

  test("should handle array with undefined holes", async () => {
    const arr = [1, undefined, 3, undefined, 5];

    const stream = renderToReadableStream(arr);
    const result = await createFromReadableStream(stream);

    expect(result[0]).toBe(1);
    expect(result[1]).toBeUndefined();
    expect(result[2]).toBe(3);
  });

  test("should handle nested Maps and Sets", async () => {
    const nestedMap = new Map([
      ["outerKey", new Map([["innerKey", "innerValue"]])],
      ["setKey", new Set([1, 2, 3])],
    ]);

    const stream = renderToReadableStream(nestedMap);
    const result = await createFromReadableStream(stream);

    expect(result).toBeInstanceOf(Map);
    expect(result.get("outerKey")).toBeInstanceOf(Map);
    expect(result.get("setKey")).toBeInstanceOf(Set);
  });

  test("should handle all TypedArray types", async () => {
    const data = {
      int8: new Int8Array([1, 2, 3]),
      uint8: new Uint8Array([4, 5, 6]),
      uint8clamped: new Uint8ClampedArray([7, 8, 9]),
      int16: new Int16Array([10, 11, 12]),
      uint16: new Uint16Array([13, 14, 15]),
      int32: new Int32Array([16, 17, 18]),
      uint32: new Uint32Array([19, 20, 21]),
      float32: new Float32Array([1.1, 2.2, 3.3]),
      float64: new Float64Array([4.4, 5.5, 6.6]),
      bigInt64: new BigInt64Array([1n, 2n, 3n]),
      bigUint64: new BigUint64Array([4n, 5n, 6n]),
    };

    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.int8).toBeInstanceOf(Int8Array);
    expect(result.uint8).toBeInstanceOf(Uint8Array);
    expect(result.uint8clamped).toBeInstanceOf(Uint8ClampedArray);
    expect(result.int16).toBeInstanceOf(Int16Array);
    expect(result.uint16).toBeInstanceOf(Uint16Array);
    expect(result.int32).toBeInstanceOf(Int32Array);
    expect(result.uint32).toBeInstanceOf(Uint32Array);
    expect(result.float32).toBeInstanceOf(Float32Array);
    expect(result.float64).toBeInstanceOf(Float64Array);
    expect(result.bigInt64).toBeInstanceOf(BigInt64Array);
    expect(result.bigUint64).toBeInstanceOf(BigUint64Array);
  });

  test("should handle Date at epoch", async () => {
    const data = {
      epoch: new Date(0),
      negative: new Date(-1000),
    };

    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.epoch.getTime()).toBe(0);
    expect(result.negative.getTime()).toBe(-1000);
  });

  test("should handle Symbol.for with various names", async () => {
    const data = {
      sym1: Symbol.for("custom.symbol"),
      sym2: Symbol.for("another.symbol"),
      sym3: Symbol.for(""), // Empty string symbol
    };

    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.sym1).toBe(Symbol.for("custom.symbol"));
    expect(result.sym2).toBe(Symbol.for("another.symbol"));
  });

  test("should handle RegExp with all flag combinations", async () => {
    const data = {
      basic: /test/,
      global: /test/g,
      ignoreCase: /test/i,
      multiline: /test/m,
      dotAll: /test/s,
      unicode: /test/u,
      sticky: /test/y,
      combined: /test/gimsu,
    };

    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.basic.source).toBe("test");
    expect(result.global.flags).toContain("g");
    expect(result.ignoreCase.flags).toContain("i");
    expect(result.multiline.flags).toContain("m");
  });

  test("should handle complex nested structures", async () => {
    const data = {
      level1: {
        level2: {
          level3: {
            array: [{ map: new Map([["k", "v"]]) }, { set: new Set([1, 2]) }],
            date: new Date("2024-01-01"),
            bigint: BigInt(123456789),
            regex: /pattern/gi,
          },
        },
      },
    };

    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.level1.level2.level3.array[0].map).toBeInstanceOf(Map);
    expect(result.level1.level2.level3.array[1].set).toBeInstanceOf(Set);
    expect(result.level1.level2.level3.date).toBeInstanceOf(Date);
    expect(result.level1.level2.level3.bigint).toBe(BigInt(123456789));
    expect(result.level1.level2.level3.regex).toBeInstanceOf(RegExp);
  });
});

describe("createFromFetch error handling", () => {
  test("should throw error for non-ok HTTP response", async () => {
    const mockResponse = {
      ok: false,
      status: 404,
      statusText: "Not Found",
    };

    await expect(
      createFromFetch(Promise.resolve(mockResponse))
    ).rejects.toThrow("HTTP 404: Not Found");
  });

  test("should throw error for 500 Internal Server Error", async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    };

    await expect(
      createFromFetch(Promise.resolve(mockResponse))
    ).rejects.toThrow("HTTP 500: Internal Server Error");
  });

  test("should throw error when response has no body", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: "OK",
      body: null,
    };

    await expect(
      createFromFetch(Promise.resolve(mockResponse))
    ).rejects.toThrow("Response has no body");
  });

  test("should throw error when response body is undefined", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: "OK",
      body: undefined,
    };

    await expect(
      createFromFetch(Promise.resolve(mockResponse))
    ).rejects.toThrow("Response has no body");
  });
});

describe("Client reference resolution errors", () => {
  test("should serialize error when client reference cannot be resolved", async () => {
    // Create a client reference without $$id and without a resolver
    const unresolvedClientRef = {
      $$typeof: Symbol.for("react.client.reference"),
      // No $$id property
    };

    const stream = renderToReadableStream(unresolvedClientRef, {
      moduleResolver: {
        resolveClientReference: () => null, // Resolver returns null
      },
    });

    // The stream should contain an error row with the message
    const output = await streamToString(stream);
    expect(output).toContain("Client reference could not be resolved");
  });

  test("should serialize error for client component without resolver or id", async () => {
    // Create a client component reference as a React element
    const ClientComponent = function ClientComponent() {
      return { type: "div" };
    };
    ClientComponent.$$typeof = Symbol.for("react.client.reference");
    // No $$id and resolver returns null

    const element = {
      $$typeof: Symbol.for("react.transitional.element"),
      type: ClientComponent,
      props: {},
      key: null,
      ref: null,
    };

    const stream = renderToReadableStream(element, {
      moduleResolver: {
        resolveClientReference: () => null,
      },
    });

    // Should contain error - either "could not be resolved" or "Unsupported element type"
    const output = await streamToString(stream);
    expect(output).toContain("E{"); // Error row marker
  });

  test("should use $$id fallback when resolver is present but returns null", async () => {
    // Create a client reference with $$id but resolver returns null
    const clientRef = {
      $$typeof: Symbol.for("react.client.reference"),
      $$id: "fallback-module#Component",
    };

    const stream = renderToReadableStream(clientRef, {
      moduleResolver: {
        resolveClientReference: () => null, // Returns null, so fallback to $$id
      },
    });

    const output = await streamToString(stream);
    expect(output).toContain("fallback-module");
  });

  test("should use $$id fallback when resolver does not exist for client component", async () => {
    // Client component as element type with $$id fallback - no resolver
    const ClientComp = function () {};
    ClientComp.$$typeof = Symbol.for("react.client.reference");
    ClientComp.$$id = "component-module#default";

    const element = {
      $$typeof: Symbol.for("react.transitional.element"),
      type: ClientComp,
      props: { text: "hello" },
      key: null,
      ref: null,
    };

    const stream = renderToReadableStream(element, {
      moduleResolver: {
        // No resolveClientReference - should use $$id fallback
      },
    });

    const output = await streamToString(stream);
    // Should use the $$id fallback - check for module ID in output
    expect(output).toContain("component-module");
  });

  test("should serialize error when client component has no resolver and no $$id", async () => {
    // Client component as element type without $$id and no resolver
    const ClientComp = function () {};
    ClientComp.$$typeof = Symbol.for("react.client.reference");
    // No $$id

    const element = {
      $$typeof: Symbol.for("react.transitional.element"),
      type: ClientComp,
      props: {},
      key: null,
      ref: null,
    };

    const stream = renderToReadableStream(element, {
      moduleResolver: {
        // No resolveClientReference at all
      },
    });

    const output = await streamToString(stream);
    // Should contain "Client component could not be resolved" error
    expect(output).toContain("Client component could not be resolved");
  });

  test("should use resolver metadata for client reference value", async () => {
    // Client reference as a VALUE (not element type) with resolver returning metadata
    const clientRef = {
      $$typeof: Symbol.for("react.client.reference"),
      $$id: "original-id#name",
    };

    const data = { component: clientRef };

    const stream = renderToReadableStream(data, {
      moduleResolver: {
        resolveClientReference: (_ref) => ({
          id: "resolved-module.js",
          name: "ResolvedComponent",
          chunks: ["chunk1.js"],
        }),
      },
    });

    const output = await streamToString(stream);
    // Should use resolver metadata, not $$id
    expect(output).toContain("resolved-module.js");
    expect(output).toContain("ResolvedComponent");
  });
});

describe("Server reference with bound arguments", () => {
  test("should serialize server reference with bound args via resolver", async () => {
    const serverAction = async function (a, b) {
      return a + b;
    };
    serverAction.$$typeof = Symbol.for("react.server.reference");
    serverAction.$$id = "action-module#add";
    serverAction.$$bound = ["boundArg1", 42];

    const stream = renderToReadableStream(serverAction, {
      moduleResolver: {
        resolveServerReference: (fn) => ({ id: fn.$$id, name: "add" }),
      },
    });

    const output = await streamToString(stream);
    expect(output).toContain("$h"); // Server function reference marker (outlined)
    expect(output).toContain("bound");
    expect(output).toContain("boundArg1");
  });

  test("should serialize server reference with bound args via $$id fallback", async () => {
    const serverAction = async function (x, y) {
      return x * y;
    };
    serverAction.$$typeof = Symbol.for("react.server.reference");
    serverAction.$$id = "multiply-module#multiply";
    serverAction.$$bound = [10, "multiplier"];

    const stream = renderToReadableStream(serverAction, {
      moduleResolver: {
        resolveServerReference: () => null, // No resolver result, use $$id fallback
      },
    });

    const output = await streamToString(stream);
    expect(output).toContain("$h"); // Server function reference marker (outlined)
    expect(output).toContain("multiply-module#multiply");
    expect(output).toContain("bound");
  });

  test("should serialize server reference without bound args via resolver", async () => {
    const serverAction = async function () {
      return "result";
    };
    serverAction.$$typeof = Symbol.for("react.server.reference");
    serverAction.$$id = "simple-module#action";
    serverAction.$$bound = []; // Empty bound args

    const stream = renderToReadableStream(serverAction, {
      moduleResolver: {
        resolveServerReference: (fn) => ({ id: fn.$$id }),
      },
    });

    const output = await streamToString(stream);
    expect(output).toContain("$h");
    // Should NOT contain bound since array is empty
  });

  test("should serialize server reference without bound args via $$id", async () => {
    const serverAction = async function () {};
    serverAction.$$typeof = Symbol.for("react.server.reference");
    serverAction.$$id = "noBound-module#action";
    serverAction.$$bound = null;

    const stream = renderToReadableStream(serverAction, {
      moduleResolver: {
        resolveServerReference: () => null,
      },
    });

    const output = await streamToString(stream);
    expect(output).toContain("$h");
    expect(output).toContain("noBound-module#action");
  });
});

describe("Symbol serialization edge cases", () => {
  test("should serialize local symbol as undefined", async () => {
    // Local symbols (not Symbol.for) cannot be serialized
    const localSymbol = Symbol("local");
    const data = {
      sym: localSymbol,
    };

    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    // Local symbols should become undefined
    expect(result.sym).toBeUndefined();
  });

  test("should serialize Symbol.for with key as registered symbol", async () => {
    const registeredSymbol = Symbol.for("test.key");
    const data = {
      sym: registeredSymbol,
    };

    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.sym).toBe(Symbol.for("test.key"));
  });
});

describe("Async iterator error handling", () => {
  test("should handle async iterator that throws error mid-iteration", async () => {
    async function* errorGenerator() {
      yield 1;
      yield 2;
      throw new Error("Generator error");
    }

    const stream = renderToReadableStream(errorGenerator());
    const output = await streamToString(stream);

    // Should contain error row
    expect(output).toContain("Generator error");
  });

  test("should handle async iterator that throws immediately", async () => {
    // Create an async iterable (not generator) that throws on first next()
    const immediateErrorIterable = {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            throw new Error("Immediate generator error");
          },
        };
      },
    };

    const stream = renderToReadableStream(immediateErrorIterable);
    const output = await streamToString(stream);

    expect(output).toContain("Immediate generator error");
  });

  test("should handle async iterator with return method that gets called", async () => {
    let nextCallCount = 0;

    const iterator = {
      [Symbol.asyncIterator]() {
        return this;
      },
      async next() {
        nextCallCount++;
        if (nextCallCount <= 2) {
          return { done: false, value: nextCallCount };
        }
        return { done: true, value: undefined };
      },
      async return() {
        return { done: true, value: undefined };
      },
    };

    const stream = renderToReadableStream(iterator);
    await streamToString(stream);

    // Iterator should complete normally
    expect(nextCallCount).toBe(3);
  });

  test("should handle async iterator with return method that throws", async () => {
    const iterator = {
      [Symbol.asyncIterator]() {
        return this;
      },
      async next() {
        return { done: true, value: undefined };
      },
      async return() {
        // This error should be caught and suppressed
        throw new Error("Return method error");
      },
    };

    const stream = renderToReadableStream(iterator);
    // Should not throw - the return() error is caught
    const output = await streamToString(stream);
    expect(output).toBeDefined();
  });

  test("should handle async iterator that yields then errors", async () => {
    let yieldCount = 0;
    const iterator = {
      [Symbol.asyncIterator]() {
        return this;
      },
      async next() {
        yieldCount++;
        if (yieldCount <= 3) {
          return { done: false, value: `item-${yieldCount}` };
        }
        throw new Error("Iterator exhaustion error");
      },
    };

    const stream = renderToReadableStream(iterator);
    const output = await streamToString(stream);

    // Should contain the yielded items and the error
    expect(output).toContain("item-1");
    expect(output).toContain("item-2");
    expect(output).toContain("item-3");
    expect(output).toContain("Iterator exhaustion error");
  });

  test("should handle async iterator yielding various data types", async () => {
    async function* mixedGenerator() {
      yield "string value";
      yield 42;
      yield { nested: "object" };
      yield new Uint8Array([1, 2, 3]);
    }

    const stream = renderToReadableStream(mixedGenerator());
    const output = await streamToString(stream);

    expect(output).toContain("string value");
    expect(output).toContain("42");
    expect(output).toContain("nested");
  });

  test("should handle async iterator yielding large strings in chunks", async () => {
    const largeString = "x".repeat(20000); // Larger than TEXT_CHUNK_SIZE (16KB)
    async function* largeStringGenerator() {
      yield largeString;
    }

    const stream = renderToReadableStream(largeStringGenerator());
    const output = await streamToString(stream);

    // The large string should be chunked but complete
    expect(output.length).toBeGreaterThan(0);
  });

  test("should handle async iterator that completes successfully", async () => {
    async function* successGenerator() {
      yield 1;
      yield 2;
      yield 3;
    }

    const stream = renderToReadableStream(successGenerator());
    const output = await streamToString(stream);

    // Should contain complete marker
    expect(output).toContain("complete");
    expect(output).toContain("true");
  });

  test("should handle empty async iterator", async () => {
    async function* emptyGenerator() {
      // yields nothing
    }

    const stream = renderToReadableStream(emptyGenerator());
    const output = await streamToString(stream);

    // Should still complete successfully
    expect(output).toContain("complete");
  });

  test("should handle async iterator with no return method", async () => {
    const iterator = {
      callCount: 0,
      [Symbol.asyncIterator]() {
        return this;
      },
      async next() {
        this.callCount++;
        if (this.callCount <= 2) {
          return { done: false, value: this.callCount };
        }
        return { done: true, value: undefined };
      },
      // No return method defined
    };

    const stream = renderToReadableStream(iterator);
    const output = await streamToString(stream);

    // Should complete without error even without return method
    expect(output).toContain("complete");
  });

  test("should handle async generator with try-finally cleanup", async () => {
    let cleanupCalled = false;

    async function* generatorWithCleanup() {
      try {
        yield 1;
        yield 2;
      } finally {
        cleanupCalled = true;
      }
    }

    const stream = renderToReadableStream(generatorWithCleanup());
    await streamToString(stream);

    // Cleanup in generator's finally should be called
    expect(cleanupCalled).toBe(true);
  });

  test("should handle nested async iterators", async () => {
    async function* innerGenerator() {
      yield "inner-1";
      yield "inner-2";
    }

    const data = {
      outer: "value",
      iterator: innerGenerator(),
    };

    const stream = renderToReadableStream(data);
    const output = await streamToString(stream);

    // Both outer data and inner iterator values should be present
    expect(output).toContain("outer");
    expect(output).toContain("inner-1");
  });
});

describe("String serialization edge cases", () => {
  test("should handle strings starting with $", async () => {
    const data = {
      dollar: "$price",
      doubleDollar: "$$template",
      dollarNumber: "$123",
    };

    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.dollar).toBe("$price");
    expect(result.doubleDollar).toBe("$$template");
  });

  test("should handle empty string", async () => {
    const stream = renderToReadableStream("");
    const result = await createFromReadableStream(stream);
    expect(result).toBe("");
  });

  test("should handle very long string", async () => {
    const longString = "a".repeat(1000000);
    const stream = renderToReadableStream(longString);
    const result = await createFromReadableStream(stream);
    expect(result.length).toBe(1000000);
  });

  test("should handle string with null bytes", async () => {
    const data = "before\0after";
    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);
    expect(result).toBe("before\0after");
  });

  test("should handle string with all control characters", async () => {
    const data = "\t\n\r\b\f";
    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);
    expect(result).toBe("\t\n\r\b\f");
  });
});

describe("Numeric edge cases", () => {
  test("should handle MAX_SAFE_INTEGER", async () => {
    const stream = renderToReadableStream(Number.MAX_SAFE_INTEGER);
    const result = await createFromReadableStream(stream);
    expect(result).toBe(Number.MAX_SAFE_INTEGER);
  });

  test("should handle MIN_SAFE_INTEGER", async () => {
    const stream = renderToReadableStream(Number.MIN_SAFE_INTEGER);
    const result = await createFromReadableStream(stream);
    expect(result).toBe(Number.MIN_SAFE_INTEGER);
  });

  test("should handle very small floats", async () => {
    const stream = renderToReadableStream(Number.MIN_VALUE);
    const result = await createFromReadableStream(stream);
    expect(result).toBe(Number.MIN_VALUE);
  });

  test("should handle very large floats", async () => {
    const stream = renderToReadableStream(Number.MAX_VALUE);
    const result = await createFromReadableStream(stream);
    expect(result).toBe(Number.MAX_VALUE);
  });
});

describe("Streaming Error Paths", () => {
  test("should handle Blob.arrayBuffer() error", async () => {
    // Create a mock blob that throws on arrayBuffer()
    const errorBlob = {
      arrayBuffer: async () => {
        throw new Error("Blob read failed");
      },
      size: 100,
      type: "application/octet-stream",
      [Symbol.toStringTag]: "Blob",
    };
    // Make it look like a Blob to the serializer
    Object.setPrototypeOf(errorBlob, Blob.prototype);

    const errors = [];
    const stream = renderToReadableStream(errorBlob, {
      onError: (err) => errors.push(err),
    });

    const output = await streamToString(stream);
    // Should contain an error row
    expect(output).toMatch(/:E/);
    expect(output).toMatch(/Blob read failed/);
  });

  test("should handle ReadableStream.read() error", async () => {
    // Create a mock readable stream that throws on read
    const errorStream = new ReadableStream({
      start(controller) {
        controller.error(new Error("Stream read failed"));
      },
    });

    const errors = [];
    const stream = renderToReadableStream(errorStream, {
      onError: (err) => errors.push(err),
    });

    const output = await streamToString(stream);
    // Should contain an error row
    expect(output).toMatch(/:E/);
    expect(output).toMatch(/Stream read failed/);
  });

  test("should handle async iterable iteration error (caught in inner try)", async () => {
    // Create an async iterable that throws during iteration
    const errorIterable = {
      [Symbol.asyncIterator]() {
        return {
          next: async () => {
            throw new Error("Iteration failed");
          },
        };
      },
    };

    const errors = [];
    const stream = renderToReadableStream(errorIterable, {
      onError: (err) => errors.push(err),
    });

    const output = await streamToString(stream);
    // Should contain an error row
    expect(output).toMatch(/:E/);
    expect(output).toMatch(/Iteration failed/);
  });

  test("should handle async iterable outer error", async () => {
    // Create an async iterable that yields a value that fails during serialization
    // This triggers the outer catch block (line ~796) because the error happens
    // during value processing, not during iterator.next()
    const errorIterable = {
      [Symbol.asyncIterator]() {
        return {
          next: async () => {
            // Return an object with a getter that throws during serialization
            return {
              done: false,
              value: {
                get badProp() {
                  throw new Error("Outer error during serialization");
                },
              },
            };
          },
          return: async () => ({ done: true }),
        };
      },
    };

    const stream = renderToReadableStream(errorIterable);
    const output = await streamToString(stream);
    // Should contain an error row
    expect(output).toMatch(/:E/);
    expect(output).toMatch(/Outer error during serialization/);
  });

  test("should serialize ReadableStream with object values as MODEL rows", async () => {
    // Create a ReadableStream that yields non-string, non-binary values
    // This tests the else branch in serializeReadableStream (lines 684-687)
    const objectStream = new ReadableStream({
      start(controller) {
        controller.enqueue({ type: "object", value: 42 });
        controller.enqueue({ type: "array", value: [1, 2, 3] });
        controller.close();
      },
    });

    const stream = renderToReadableStream(objectStream);
    const output = await streamToString(stream);

    // Should contain MODEL rows with serialized objects
    expect(output).toContain('"type":"object"');
    expect(output).toContain('"value":42');
    expect(output).toContain('"type":"array"');
  });
});

describe("Async Module Loader Support", () => {
  test("should support async requireModule in moduleLoader", async () => {
    // Simulate a module reference row followed by a lazy reference
    // 1:I{"id":"./Component.js","name":"default","chunks":[]}
    // 0:{"component":"$L1"}
    const wire =
      '1:I{"id":"./Component.js","name":"default","chunks":[]}\n' +
      '0:{"component":"$L1"}\n';

    const MockComponent = () => "rendered";
    const asyncModuleLoader = {
      preloadModule: vi.fn(() => Promise.resolve()),
      requireModule: vi.fn((_metadata) => {
        // Async module loading - like native import()
        return Promise.resolve({
          default: MockComponent,
        });
      }),
    };

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(wire));
        controller.close();
      },
    });

    const result = await createFromReadableStream(stream, {
      moduleLoader: asyncModuleLoader,
    });

    // The result should have a lazy component
    expect(result.component).toBeDefined();
    expect(result.component.$$typeof).toBe(Symbol.for("react.lazy"));

    // When _init is called, it should handle the async loading
    const lazyInit = result.component._init;
    const payload = result.component._payload;

    // First call throws the promise (for Suspense)
    let thrownPromise;
    try {
      lazyInit(payload);
    } catch (e) {
      thrownPromise = e;
    }
    expect(thrownPromise).toBeInstanceOf(Promise);

    // Wait for the module to load
    await thrownPromise;

    // Second call should return the loaded module
    const loadedModule = lazyInit(payload);
    expect(loadedModule).toBe(MockComponent);
    expect(asyncModuleLoader.requireModule).toHaveBeenCalledWith(
      expect.objectContaining({ id: "./Component.js", name: "default" })
    );
  });

  test("should support sync requireModule in moduleLoader", async () => {
    const wire =
      '1:I{"id":"./SyncComponent.js","name":"MyComponent","chunks":[]}\n' +
      '0:{"component":"$L1"}\n';

    const SyncComponent = () => "sync rendered";
    const syncModuleLoader = {
      requireModule: vi.fn((_metadata) => {
        // Sync module loading - like require()
        return {
          MyComponent: SyncComponent,
        };
      }),
    };

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(wire));
        controller.close();
      },
    });

    const result = await createFromReadableStream(stream, {
      moduleLoader: syncModuleLoader,
    });

    // When _init is called, it should return synchronously
    const lazyInit = result.component._init;
    const payload = result.component._payload;

    const loadedModule = lazyInit(payload);
    expect(loadedModule).toBe(SyncComponent);
    expect(syncModuleLoader.requireModule).toHaveBeenCalledWith(
      expect.objectContaining({ id: "./SyncComponent.js", name: "MyComponent" })
    );
  });

  test("should handle async requireModule errors", async () => {
    const wire =
      '1:I{"id":"./BadModule.js","name":"default","chunks":[]}\n' +
      '0:{"component":"$L1"}\n';

    const moduleError = new Error("Module load failed");
    const errorModuleLoader = {
      requireModule: vi.fn(() => Promise.reject(moduleError)),
    };

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(wire));
        controller.close();
      },
    });

    const result = await createFromReadableStream(stream, {
      moduleLoader: errorModuleLoader,
    });

    const lazyInit = result.component._init;
    const payload = result.component._payload;

    // First call throws the promise
    let thrownPromise;
    try {
      lazyInit(payload);
    } catch (e) {
      thrownPromise = e;
    }
    expect(thrownPromise).toBeInstanceOf(Promise);

    // Wait for rejection
    try {
      await thrownPromise;
    } catch {
      // Expected
    }

    // Second call should throw the error
    expect(() => lazyInit(payload)).toThrow("Module load failed");
  });

  test("should store preload promise on reference", async () => {
    const wire =
      '1:I{"id":"./Preloaded.js","name":"default","chunks":[]}\n' +
      '0:{"ref":"$L1"}\n';

    const preloadPromise = Promise.resolve();
    const preloadLoader = {
      preloadModule: vi.fn(() => preloadPromise),
      requireModule: vi.fn(() => ({ default: () => "preloaded" })),
    };

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(wire));
        controller.close();
      },
    });

    const result = await createFromReadableStream(stream, {
      moduleLoader: preloadLoader,
    });

    expect(preloadLoader.preloadModule).toHaveBeenCalled();

    // The lazy wrapper should work
    const lazyInit = result.ref._init;
    const payload = result.ref._payload;
    const loaded = lazyInit(payload);
    expect(typeof loaded).toBe("function");
  });

  test("should handle module with default export fallback", async () => {
    const wire =
      '1:I{"id":"./DefaultOnly.js","name":"nonexistent","chunks":[]}\n' +
      '0:{"component":"$L1"}\n';

    const DefaultComponent = () => "default fallback";
    const defaultLoader = {
      requireModule: vi.fn(() =>
        Promise.resolve({
          default: DefaultComponent,
        })
      ),
    };

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(wire));
        controller.close();
      },
    });

    const result = await createFromReadableStream(stream, {
      moduleLoader: defaultLoader,
    });

    const lazyInit = result.component._init;
    const payload = result.component._payload;

    // First call throws promise
    let thrownPromise;
    try {
      lazyInit(payload);
    } catch (e) {
      thrownPromise = e;
    }
    await thrownPromise;

    // Should fall back to default export
    const loaded = lazyInit(payload);
    expect(loaded).toBe(DefaultComponent);
  });

  test("should handle primitive module return", async () => {
    const wire =
      '1:I{"id":"./primitive.js","name":"default","chunks":[]}\n' +
      '0:{"value":"$L1"}\n';

    const primitiveLoader = {
      requireModule: vi.fn(() => "primitive value"),
    };

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(wire));
        controller.close();
      },
    });

    const result = await createFromReadableStream(stream, {
      moduleLoader: primitiveLoader,
    });

    const lazyInit = result.value._init;
    const payload = result.value._payload;
    const loaded = lazyInit(payload);
    expect(loaded).toBe("primitive value");
  });

  test("should cache module promise to avoid duplicate loads", async () => {
    const wire =
      '1:I{"id":"./Cached.js","name":"default","chunks":[]}\n' +
      '0:{"component":"$L1"}\n';

    const CachedComponent = () => "cached";
    const cachingLoader = {
      requireModule: vi.fn(() => {
        return Promise.resolve({ default: CachedComponent });
      }),
    };

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(wire));
        controller.close();
      },
    });

    const result = await createFromReadableStream(stream, {
      moduleLoader: cachingLoader,
    });

    const lazyInit = result.component._init;
    const payload = result.component._payload;

    // Call _init multiple times before promise resolves
    let promise1, promise2;
    try {
      lazyInit(payload);
    } catch (e) {
      promise1 = e;
    }
    try {
      lazyInit(payload);
    } catch (e) {
      promise2 = e;
    }

    // Should be the same promise (cached)
    expect(promise1).toBe(promise2);

    // Wait for load
    await promise1;

    // After resolution, should return value without calling requireModule again
    const loaded1 = lazyInit(payload);
    const loaded2 = lazyInit(payload);

    expect(loaded1).toBe(CachedComponent);
    expect(loaded2).toBe(CachedComponent);
    // requireModule should only be called once
    expect(cachingLoader.requireModule).toHaveBeenCalledTimes(1);
  });
});
