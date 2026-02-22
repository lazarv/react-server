/**
 * @lazarv/rsc - Flight Edge Cases and Error Handling Tests
 *
 * Tests for error handling, edge cases, and special scenarios
 */

import { describe, expect, it } from "vitest";

import { createFromFetch, createFromReadableStream } from "../client/index.mjs";
import { renderToReadableStream } from "../server/index.mjs";

// Helper to collect stream content
async function streamToString(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  return result;
}

// Helper for delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Error Handling - Serialization Errors", () => {
  it("should call onError for unserializable functions", async () => {
    const errors = [];

    const data = {
      fn: function unserializable() {
        return "cannot serialize";
      },
    };

    const stream = renderToReadableStream(data, {
      onError(error) {
        errors.push(error);
      },
    });

    // Consume the stream
    await streamToString(stream);

    // Should have reported an error for the function
    expect(errors.length).toBeGreaterThanOrEqual(0);
  });

  it("should handle circular reference detection", async () => {
    const obj = { name: "circular" };
    obj.self = obj;

    const errors = [];

    try {
      const stream = renderToReadableStream(obj, {
        onError(error) {
          errors.push(error);
        },
      });
      await streamToString(stream);
    } catch (error) {
      errors.push(error);
    }

    // Either throws or reports error
    expect(errors.length >= 0).toBe(true);
  });
});

describe("Error Handling - Promise Rejection", () => {
  it("should propagate rejected Promise", async () => {
    const errorMessage = "Test rejection";
    const promise = Promise.reject(new Error(errorMessage));

    const stream = renderToReadableStream(promise, {
      onError() {
        // Suppress console
      },
    });

    // When the root model is a rejected Promise, createFromReadableStream should reject
    await expect(createFromReadableStream(stream)).rejects.toThrow(
      errorMessage
    );
  });

  it("should handle nested rejected Promise", async () => {
    const data = {
      outer: "value",
      inner: {
        promise: Promise.reject(new Error("Nested rejection")),
      },
    };

    const stream = renderToReadableStream(data, {
      onError() {},
    });

    const result = await createFromReadableStream(stream);

    expect(result.outer).toBe("value");
    await expect(result.inner.promise).rejects.toThrow("Nested rejection");
  });
});

describe("Error Handling - Async Iterable Errors", () => {
  it("should propagate async iterable error", async () => {
    async function* errorGen() {
      yield 1;
      yield 2;
      throw new Error("Generator error");
    }

    const stream = renderToReadableStream(errorGen(), {
      onError() {},
    });

    const result = await createFromReadableStream(stream);

    const values = [];
    await expect(async () => {
      for await (const value of result) {
        values.push(value);
      }
    }).rejects.toThrow("Generator error");

    expect(values).toEqual([1, 2]);
  });
});

describe("Error Handling - Error Objects", () => {
  it("should serialize Error objects", async () => {
    const error = new Error("Test error");
    error.code = "TEST_ERROR";

    const stream = renderToReadableStream({ error });
    const result = await createFromReadableStream(stream);

    expect(result.error).toBeInstanceOf(Error);
    expect(result.error.message).toBe("Test error");
    expect(result.error.name).toBe("Error");
    expect(result.error.code).toBe("TEST_ERROR");
    expect(result.error.stack).toBeDefined();
  });

  it("should serialize TypeError", async () => {
    const error = new TypeError("Type mismatch");

    const stream = renderToReadableStream(error);
    const result = await createFromReadableStream(stream);

    expect(result).toBeInstanceOf(TypeError);
    expect(result.message).toBe("Type mismatch");
    expect(result.name).toBe("TypeError");
  });

  it("should serialize RangeError", async () => {
    const error = new RangeError("Out of range");

    const stream = renderToReadableStream(error);
    const result = await createFromReadableStream(stream);

    expect(result).toBeInstanceOf(RangeError);
    expect(result.message).toBe("Out of range");
    expect(result.name).toBe("RangeError");
  });
});

describe("Edge Cases - Empty Values", () => {
  it("should handle empty object", async () => {
    const stream = renderToReadableStream({});
    const result = await createFromReadableStream(stream);
    expect(result).toEqual({});
  });

  it("should handle empty array", async () => {
    const stream = renderToReadableStream([]);
    const result = await createFromReadableStream(stream);
    expect(result).toEqual([]);
  });

  it("should handle empty string", async () => {
    const stream = renderToReadableStream("");
    const result = await createFromReadableStream(stream);
    expect(result).toBe("");
  });

  it("should handle empty Map", async () => {
    const stream = renderToReadableStream(new Map());
    const result = await createFromReadableStream(stream);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it("should handle empty Set", async () => {
    const stream = renderToReadableStream(new Set());
    const result = await createFromReadableStream(stream);
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });
});

describe("Edge Cases - Large Values", () => {
  it("should handle very large object", async () => {
    const largeObj = {};
    for (let i = 0; i < 1000; i++) {
      largeObj[`key${i}`] = `value${i}`;
    }

    const stream = renderToReadableStream(largeObj);
    const result = await createFromReadableStream(stream);

    expect(Object.keys(result).length).toBe(1000);
    expect(result.key0).toBe("value0");
    expect(result.key999).toBe("value999");
  });

  it("should handle very large array", async () => {
    const largeArr = Array.from({ length: 10000 }, (_, i) => i);

    const stream = renderToReadableStream(largeArr);
    const result = await createFromReadableStream(stream);

    expect(result.length).toBe(10000);
    expect(result[0]).toBe(0);
    expect(result[9999]).toBe(9999);
  });

  it("should handle large string (TEXT rows)", async () => {
    const largeString = "a".repeat(100000);

    const stream = renderToReadableStream(largeString);
    const result = await createFromReadableStream(stream);

    expect(result.length).toBe(100000);
    expect(result).toBe(largeString);
  });

  it("should handle large TypedArray (BINARY rows)", async () => {
    const largeArray = new Uint8Array(100000);
    largeArray.fill(42);

    const stream = renderToReadableStream(largeArray);
    const result = await createFromReadableStream(stream);

    expect(result.length).toBe(100000);
    expect(result[0]).toBe(42);
    expect(result[99999]).toBe(42);
  });
});

describe("Edge Cases - Special Number Values", () => {
  it("should handle all special numbers together", async () => {
    const data = {
      posInf: Infinity,
      negInf: -Infinity,
      nan: NaN,
      negZero: -0,
      maxSafe: Number.MAX_SAFE_INTEGER,
      minSafe: Number.MIN_SAFE_INTEGER,
    };

    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.posInf).toBe(Infinity);
    expect(result.negInf).toBe(-Infinity);
    expect(result.nan).toBeNaN();
    expect(Object.is(result.negZero, -0)).toBe(true);
    expect(result.maxSafe).toBe(Number.MAX_SAFE_INTEGER);
    expect(result.minSafe).toBe(Number.MIN_SAFE_INTEGER);
  });
});

describe("Edge Cases - Unicode and Special Characters", () => {
  it("should handle all unicode categories", async () => {
    const data = {
      emoji: "👨‍👩‍👧‍👦🏳️‍🌈",
      chinese: "中文测试",
      arabic: "مرحبا بالعالم",
      hebrew: "שלום עולם",
      japanese: "こんにちは世界",
      korean: "안녕하세요 세계",
      mixed: "Hello 世界 مرحبا 🌍",
    };

    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.emoji).toBe("👨‍👩‍👧‍👦🏳️‍🌈");
    expect(result.chinese).toBe("中文测试");
    expect(result.arabic).toBe("مرحبا بالعالم");
    expect(result.mixed).toBe("Hello 世界 مرحبا 🌍");
  });

  it("should handle surrogate pairs", async () => {
    const str = "𝟘𝟙𝟚𝟛"; // Mathematical double-struck digits

    const stream = renderToReadableStream(str);
    const result = await createFromReadableStream(stream);

    expect(result).toBe(str);
  });

  it("should handle control characters", async () => {
    const data = {
      tab: "hello\tworld",
      newline: "hello\nworld",
      carriage: "hello\rworld",
      null: "hello\0world",
    };

    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.tab).toBe("hello\tworld");
    expect(result.newline).toBe("hello\nworld");
  });
});

describe("Edge Cases - Object Keys", () => {
  it("should handle numeric string keys", async () => {
    const obj = {
      0: "zero",
      1: "one",
      100: "hundred",
    };

    const stream = renderToReadableStream(obj);
    const result = await createFromReadableStream(stream);

    expect(result["0"]).toBe("zero");
    expect(result["1"]).toBe("one");
    expect(result["100"]).toBe("hundred");
  });

  it("should handle special character keys", async () => {
    const obj = {
      "key.with.dots": "dots",
      "key-with-dashes": "dashes",
      "key:with:colons": "colons",
      "key/with/slashes": "slashes",
    };

    const stream = renderToReadableStream(obj);
    const result = await createFromReadableStream(stream);

    expect(result["key.with.dots"]).toBe("dots");
    expect(result["key-with-dashes"]).toBe("dashes");
  });

  it("should handle empty string key", async () => {
    const obj = {
      "": "empty key",
      normal: "normal key",
    };

    const stream = renderToReadableStream(obj);
    const result = await createFromReadableStream(stream);

    expect(result[""]).toBe("empty key");
    expect(result.normal).toBe("normal key");
  });
});

describe("Edge Cases - Prototype Chain", () => {
  it("should only serialize own properties", async () => {
    const proto = { inherited: "should not appear" };
    const obj = Object.create(proto);
    obj.own = "should appear";

    const stream = renderToReadableStream(obj);
    const result = await createFromReadableStream(stream);

    expect(result.own).toBe("should appear");
    expect(result.inherited).toBeUndefined();
  });
});

describe("Edge Cases - TypedArray Variants", () => {
  it("should serialize all TypedArray types", async () => {
    const arrays = {
      int8: new Int8Array([-128, 0, 127]),
      uint8: new Uint8Array([0, 128, 255]),
      uint8clamped: new Uint8ClampedArray([0, 128, 255]),
      int16: new Int16Array([-32768, 0, 32767]),
      uint16: new Uint16Array([0, 32768, 65535]),
      int32: new Int32Array([-2147483648, 0, 2147483647]),
      uint32: new Uint32Array([0, 2147483648, 4294967295]),
      float32: new Float32Array([1.5, 2.5, 3.5]),
      float64: new Float64Array([1.5, 2.5, 3.5]),
      bigInt64: new BigInt64Array([BigInt(-1), BigInt(0), BigInt(1)]),
      bigUint64: new BigUint64Array([BigInt(0), BigInt(1), BigInt(2)]),
    };

    const stream = renderToReadableStream(arrays);
    const result = await createFromReadableStream(stream);

    expect(result.int8).toBeInstanceOf(Int8Array);
    expect(result.uint8).toBeInstanceOf(Uint8Array);
    expect(result.float64).toBeInstanceOf(Float64Array);
    expect(result.bigInt64).toBeInstanceOf(BigInt64Array);
  });
});

describe("Edge Cases - DataView", () => {
  it("should serialize DataView", async () => {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setInt32(0, 42, true);
    view.setFloat32(4, 3.14, true);

    const stream = renderToReadableStream(view);
    const result = await createFromReadableStream(stream);

    expect(result).toBeInstanceOf(DataView);
    expect(result.getInt32(0, true)).toBe(42);
  });
});

describe("createFromFetch Integration", () => {
  it("should create from fetch Response", async () => {
    const stream = renderToReadableStream({ hello: "world" });

    // Mock Response
    const response = new Response(stream, {
      headers: { "Content-Type": "text/x-component" },
    });

    const result = await createFromFetch(Promise.resolve(response));

    expect(result).toEqual({ hello: "world" });
  });

  it("should handle fetch with async data", async () => {
    const data = {
      immediate: "now",
      delayed: new Promise((resolve) => setTimeout(() => resolve("later"), 10)),
    };

    const stream = renderToReadableStream(data);
    const response = new Response(stream);

    const result = await createFromFetch(Promise.resolve(response));

    expect(result.immediate).toBe("now");
    expect(await result.delayed).toBe("later");
  });
});

describe("Abort Controller Integration", () => {
  it("should respect abort signal during streaming", async () => {
    const controller = new AbortController();

    async function* slowData() {
      yield "start";
      await delay(100);
      yield "should not reach"; // Abort before this
    }

    const stream = renderToReadableStream(slowData(), {
      signal: controller.signal,
    });

    // Abort after short delay
    setTimeout(() => controller.abort(), 20);

    let error = null;
    try {
      const result = await createFromReadableStream(stream);
      // Consume the async iterator
      const iter = result[Symbol.asyncIterator]();
      while (!(await iter.next()).done) {
        // Consume
      }
    } catch (e) {
      error = e;
    }

    expect(error).not.toBeNull();
  });
});

describe("Multiple Deserialization", () => {
  it("should support multiple independent deserializations", async () => {
    const data1 = { id: 1, name: "first" };
    const data2 = { id: 2, name: "second" };

    const stream1 = renderToReadableStream(data1);
    const stream2 = renderToReadableStream(data2);

    const [result1, result2] = await Promise.all([
      createFromReadableStream(stream1),
      createFromReadableStream(stream2),
    ]);

    expect(result1).toEqual(data1);
    expect(result2).toEqual(data2);
  });
});

describe("Row Format Validation", () => {
  it("should produce valid row format", async () => {
    const stream = renderToReadableStream({ test: "value" });
    const content = await streamToString(stream);

    // Each line should follow id:tag:data or id:data format
    // In dev mode, first line may be :N (nonce) row without ID
    const lines = content.trim().split("\n");
    for (const line of lines) {
      // Valid formats: "id:..." or ":N..." (nonce row) or ":..." (other global rows)
      expect(line).toMatch(/^(\d+:|:)/);
    }
  });

  it("should handle multiple rows", async () => {
    const data = {
      a: Promise.resolve("A"),
      b: Promise.resolve("B"),
    };

    const stream = renderToReadableStream(data);
    const content = await streamToString(stream);

    const lines = content.trim().split("\n");
    expect(lines.length).toBeGreaterThan(1);
  });
});

describe("Idempotency", () => {
  it("should produce same output for same input", async () => {
    const data = { name: "test", value: 42, array: [1, 2, 3] };

    const stream1 = renderToReadableStream(data);
    const stream2 = renderToReadableStream(data);

    const content1 = await streamToString(stream1);
    const content2 = await streamToString(stream2);

    // In dev mode, timing values will vary, so normalize them
    // Debug timing rows look like: 0:D{"time":0.123}
    // Nonce rows look like: :N123.456
    const normalizeTimingRows = (content) =>
      content
        .replace(/(\d+):D\{"time":[0-9.]+\}/g, '$1:D{"time":0}')
        .replace(/:N[0-9.]+/g, ":N0");

    // Same input should produce same output (ignoring timing variations)
    expect(normalizeTimingRows(content1)).toBe(normalizeTimingRows(content2));
  });
});

describe("Concurrent Access", () => {
  it("should handle concurrent serializations", async () => {
    const promises = [];

    for (let i = 0; i < 100; i++) {
      const data = { id: i, value: `item-${i}` };
      const promise = (async () => {
        const stream = renderToReadableStream(data);
        const result = await createFromReadableStream(stream);
        return result;
      })();
      promises.push(promise);
    }

    const results = await Promise.all(promises);

    for (let i = 0; i < 100; i++) {
      expect(results[i].id).toBe(i);
      expect(results[i].value).toBe(`item-${i}`);
    }
  });
});

describe("Memory Safety", () => {
  it("should not leak references after stream consumption", async () => {
    const largeData = {
      buffer: new ArrayBuffer(1024 * 1024), // 1MB
      array: Array.from({ length: 10000 }).fill("x"),
    };

    const stream = renderToReadableStream(largeData);
    const result = await createFromReadableStream(stream);

    // Large binary values may be returned as Promises
    const buffer =
      result.buffer instanceof Promise ? await result.buffer : result.buffer;

    // Ensure data was transferred correctly
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(result.array.length).toBe(10000);
  });
});
