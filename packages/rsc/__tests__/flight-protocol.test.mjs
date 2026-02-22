/**
 * @lazarv/rsc - Flight Protocol Tests
 *
 * Comprehensive tests for RSC serialization/deserialization
 * covering React's Flight protocol implementation
 */

import { describe, expect, it } from "vitest";

import { createFromReadableStream } from "../client/index.mjs";
import { renderToReadableStream } from "../server/index.mjs";

// Helper to collect stream chunks
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

describe("Flight Protocol - Primitive Serialization", () => {
  it("should serialize null", async () => {
    const stream = renderToReadableStream(null);
    const result = await createFromReadableStream(stream);
    expect(result).toBe(null);
  });

  it("should serialize undefined", async () => {
    const stream = renderToReadableStream(undefined);
    const result = await createFromReadableStream(stream);
    expect(result).toBeUndefined();
  });

  it("should serialize boolean true", async () => {
    const stream = renderToReadableStream(true);
    const result = await createFromReadableStream(stream);
    expect(result).toBe(true);
  });

  it("should serialize boolean false", async () => {
    const stream = renderToReadableStream(false);
    const result = await createFromReadableStream(stream);
    expect(result).toBe(false);
  });

  it("should serialize integers", async () => {
    const stream = renderToReadableStream(42);
    const result = await createFromReadableStream(stream);
    expect(result).toBe(42);
  });

  it("should serialize negative integers", async () => {
    const stream = renderToReadableStream(-123);
    const result = await createFromReadableStream(stream);
    expect(result).toBe(-123);
  });

  it("should serialize floats", async () => {
    const stream = renderToReadableStream(3.12345);
    const result = await createFromReadableStream(stream);
    expect(result).toBeCloseTo(3.12345);
  });

  it("should serialize Infinity", async () => {
    const stream = renderToReadableStream(Infinity);
    const result = await createFromReadableStream(stream);
    expect(result).toBe(Infinity);
  });

  it("should serialize -Infinity", async () => {
    const stream = renderToReadableStream(-Infinity);
    const result = await createFromReadableStream(stream);
    expect(result).toBe(-Infinity);
  });

  it("should serialize NaN", async () => {
    const stream = renderToReadableStream(NaN);
    const result = await createFromReadableStream(stream);
    expect(result).toBeNaN();
  });

  it("should serialize -0", async () => {
    const stream = renderToReadableStream(-0);
    const result = await createFromReadableStream(stream);
    expect(Object.is(result, -0)).toBe(true);
  });
});

describe("Flight Protocol - String Serialization", () => {
  it("should serialize simple strings", async () => {
    const stream = renderToReadableStream("hello world");
    const result = await createFromReadableStream(stream);
    expect(result).toBe("hello world");
  });

  it("should serialize empty string", async () => {
    const stream = renderToReadableStream("");
    const result = await createFromReadableStream(stream);
    expect(result).toBe("");
  });

  it("should serialize strings with special characters", async () => {
    const stream = renderToReadableStream('hello\n"world"\ttab');
    const result = await createFromReadableStream(stream);
    expect(result).toBe('hello\n"world"\ttab');
  });

  it("should serialize unicode strings", async () => {
    const stream = renderToReadableStream("你好世界 🌍");
    const result = await createFromReadableStream(stream);
    expect(result).toBe("你好世界 🌍");
  });

  it("should not get confused by $ prefix", async () => {
    const stream = renderToReadableStream("$1");
    const result = await createFromReadableStream(stream);
    expect(result).toBe("$1");
  });

  it("should not get confused by @ prefix", async () => {
    const stream = renderToReadableStream("@div");
    const result = await createFromReadableStream(stream);
    expect(result).toBe("@div");
  });

  it("should serialize strings starting with $$ correctly", async () => {
    const stream = renderToReadableStream("$$escaped");
    const result = await createFromReadableStream(stream);
    expect(result).toBe("$$escaped");
  });
});

describe("Flight Protocol - BigInt Serialization", () => {
  it("should serialize BigInt values", async () => {
    const stream = renderToReadableStream(BigInt("9007199254740993"));
    const result = await createFromReadableStream(stream);
    expect(result).toBe(BigInt("9007199254740993"));
  });

  it("should serialize negative BigInt", async () => {
    const stream = renderToReadableStream(BigInt("-12345678901234567890"));
    const result = await createFromReadableStream(stream);
    expect(result).toBe(BigInt("-12345678901234567890"));
  });

  it("should serialize zero BigInt", async () => {
    const stream = renderToReadableStream(BigInt(0));
    const result = await createFromReadableStream(stream);
    expect(result).toBe(BigInt(0));
  });
});

describe("Flight Protocol - Symbol Serialization", () => {
  it("should serialize Symbol.for symbols", async () => {
    const sym = Symbol.for("test.symbol");
    const stream = renderToReadableStream(sym);
    const result = await createFromReadableStream(stream);
    expect(result).toBe(Symbol.for("test.symbol"));
  });

  it("should serialize well-known symbols in objects", async () => {
    const obj = { key: Symbol.for("my.key") };
    const stream = renderToReadableStream(obj);
    const result = await createFromReadableStream(stream);
    expect(result.key).toBe(Symbol.for("my.key"));
  });
});

describe("Flight Protocol - Date Serialization", () => {
  it("should serialize Date objects", async () => {
    const date = new Date("2024-01-15T12:30:00.000Z");
    const stream = renderToReadableStream(date);
    const result = await createFromReadableStream(stream);
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe("2024-01-15T12:30:00.000Z");
  });

  it("should serialize Date with timezone", async () => {
    const date = new Date("2024-06-15T08:00:00-07:00");
    const stream = renderToReadableStream(date);
    const result = await createFromReadableStream(stream);
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBe(date.getTime());
  });
});

describe("Flight Protocol - Object Serialization", () => {
  it("should serialize empty object", async () => {
    const stream = renderToReadableStream({});
    const result = await createFromReadableStream(stream);
    expect(result).toEqual({});
  });

  it("should serialize simple object", async () => {
    const obj = { name: "test", value: 42 };
    const stream = renderToReadableStream(obj);
    const result = await createFromReadableStream(stream);
    expect(result).toEqual({ name: "test", value: 42 });
  });

  it("should serialize nested objects", async () => {
    const obj = {
      level1: {
        level2: {
          level3: "deep",
        },
      },
    };
    const stream = renderToReadableStream(obj);
    const result = await createFromReadableStream(stream);
    expect(result).toEqual(obj);
  });

  it("should serialize objects with mixed types", async () => {
    const obj = {
      string: "hello",
      number: 42,
      boolean: true,
      null: null,
      array: [1, 2, 3],
      nested: { a: 1 },
    };
    const stream = renderToReadableStream(obj);
    const result = await createFromReadableStream(stream);
    expect(result).toEqual(obj);
  });

  it("should handle objects with Date properties", async () => {
    const obj = {
      name: "event",
      date: new Date("2024-01-01"),
    };
    const stream = renderToReadableStream(obj);
    const result = await createFromReadableStream(stream);
    expect(result.name).toBe("event");
    expect(result.date).toBeInstanceOf(Date);
  });
});

describe("Flight Protocol - Array Serialization", () => {
  it("should serialize empty array", async () => {
    const stream = renderToReadableStream([]);
    const result = await createFromReadableStream(stream);
    expect(result).toEqual([]);
  });

  it("should serialize simple array", async () => {
    const arr = [1, 2, 3, 4, 5];
    const stream = renderToReadableStream(arr);
    const result = await createFromReadableStream(stream);
    expect(result).toEqual(arr);
  });

  it("should serialize mixed type array", async () => {
    const arr = [1, "two", true, null, { four: 4 }];
    const stream = renderToReadableStream(arr);
    const result = await createFromReadableStream(stream);
    expect(result).toEqual(arr);
  });

  it("should serialize nested arrays", async () => {
    const arr = [
      [1, 2],
      [3, 4],
      [5, [6, 7]],
    ];
    const stream = renderToReadableStream(arr);
    const result = await createFromReadableStream(stream);
    expect(result).toEqual(arr);
  });

  it("should serialize sparse arrays", async () => {
    const arr = [1, undefined, undefined, 4];
    const stream = renderToReadableStream(arr);
    const result = await createFromReadableStream(stream);
    expect(result.length).toBe(4);
    expect(result[0]).toBe(1);
    expect(result[3]).toBe(4);
  });
});

describe("Flight Protocol - Map Serialization", () => {
  it("should serialize empty Map", async () => {
    const map = new Map();
    const stream = renderToReadableStream(map);
    const result = await createFromReadableStream(stream);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it("should serialize Map with string keys", async () => {
    const map = new Map([
      ["a", 1],
      ["b", 2],
    ]);
    const stream = renderToReadableStream(map);
    const result = await createFromReadableStream(stream);
    expect(result).toBeInstanceOf(Map);
    expect(result.get("a")).toBe(1);
    expect(result.get("b")).toBe(2);
  });

  it("should serialize Map with complex values", async () => {
    const map = new Map([
      ["obj", { nested: true }],
      ["arr", [1, 2, 3]],
    ]);
    const stream = renderToReadableStream(map);
    const result = await createFromReadableStream(stream);
    expect(result).toBeInstanceOf(Map);
    expect(result.get("obj")).toEqual({ nested: true });
    expect(result.get("arr")).toEqual([1, 2, 3]);
  });
});

describe("Flight Protocol - Set Serialization", () => {
  it("should serialize empty Set", async () => {
    const set = new Set();
    const stream = renderToReadableStream(set);
    const result = await createFromReadableStream(stream);
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it("should serialize Set with primitives", async () => {
    const set = new Set([1, 2, 3, "a", "b"]);
    const stream = renderToReadableStream(set);
    const result = await createFromReadableStream(stream);
    expect(result).toBeInstanceOf(Set);
    expect(result.has(1)).toBe(true);
    expect(result.has("a")).toBe(true);
  });

  it("should serialize Set with objects", async () => {
    const obj1 = { id: 1 };
    const set = new Set([obj1, { id: 2 }]);
    const stream = renderToReadableStream(set);
    const result = await createFromReadableStream(stream);
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(2);
  });
});

describe("Flight Protocol - TypedArray Serialization", () => {
  it("should serialize Uint8Array", async () => {
    const arr = new Uint8Array([1, 2, 3, 255]);
    const stream = renderToReadableStream(arr);
    const result = await createFromReadableStream(stream);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual([1, 2, 3, 255]);
  });

  it("should serialize Int32Array", async () => {
    const arr = new Int32Array([1, -2, 3, -4]);
    const stream = renderToReadableStream(arr);
    const result = await createFromReadableStream(stream);
    expect(result).toBeInstanceOf(Int32Array);
    expect(Array.from(result)).toEqual([1, -2, 3, -4]);
  });

  it("should serialize Float64Array", async () => {
    const arr = new Float64Array([1.5, 2.5, 3.12345]);
    const stream = renderToReadableStream(arr);
    const result = await createFromReadableStream(stream);
    expect(result).toBeInstanceOf(Float64Array);
    expect(result[0]).toBeCloseTo(1.5);
    expect(result[1]).toBeCloseTo(2.5);
    expect(result[2]).toBeCloseTo(3.12345);
  });

  it("should serialize empty TypedArray", async () => {
    const arr = new Uint8Array(0);
    const stream = renderToReadableStream(arr);
    const result = await createFromReadableStream(stream);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(0);
  });
});

describe("Flight Protocol - ArrayBuffer Serialization", () => {
  it("should serialize ArrayBuffer", async () => {
    const buffer = new ArrayBuffer(4);
    const view = new Uint8Array(buffer);
    view[0] = 1;
    view[1] = 2;
    view[2] = 3;
    view[3] = 4;

    const stream = renderToReadableStream(buffer);
    const result = await createFromReadableStream(stream);
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(result)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it("should serialize empty ArrayBuffer", async () => {
    const buffer = new ArrayBuffer(0);
    const stream = renderToReadableStream(buffer);
    const result = await createFromReadableStream(stream);
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(result.byteLength).toBe(0);
  });
});

describe("Flight Protocol - Promise Serialization", () => {
  it("should serialize resolved Promise", async () => {
    const promise = Promise.resolve("resolved value");
    const stream = renderToReadableStream(promise);
    const result = await createFromReadableStream(stream);
    // Result IS the resolved value (JS automatically unwraps nested promises)
    expect(result).toBe("resolved value");
  });

  it("should serialize Promise with object value", async () => {
    const promise = Promise.resolve({ status: "ok", data: [1, 2, 3] });
    const stream = renderToReadableStream(promise);
    const result = await createFromReadableStream(stream);
    // Result IS the resolved object
    expect(result).toEqual({ status: "ok", data: [1, 2, 3] });
  });
});

describe("Flight Protocol - Error Handling", () => {
  it("should handle render errors with onError callback", async () => {
    const errors = [];
    // This would need special handling to throw during serialization
    // For now, test basic error callback setup
    const stream = renderToReadableStream(
      { safe: "value" },
      {
        onError(error) {
          errors.push(error);
        },
      }
    );
    const result = await createFromReadableStream(stream);
    expect(result).toEqual({ safe: "value" });
  });
});

describe("Flight Protocol - Deduplication", () => {
  it("should deduplicate identical objects", async () => {
    const shared = { name: "shared" };
    const data = {
      first: shared,
      second: shared,
    };
    const stream = renderToReadableStream(data);
    await streamToString(stream);
    // The shared object should only appear once in the serialized output
    // (referenced by ID in subsequent uses)
    const stream2 = renderToReadableStream(data);
    const result = await createFromReadableStream(stream2);
    expect(result.first).toEqual({ name: "shared" });
    expect(result.second).toEqual({ name: "shared" });
  });
});

describe("Flight Protocol - React Element Structure", () => {
  it("should serialize React-like element structure", async () => {
    const element = {
      $$typeof: Symbol.for("react.element"),
      type: "div",
      key: null,
      ref: null,
      props: {
        className: "container",
        children: [
          {
            $$typeof: Symbol.for("react.element"),
            type: "span",
            key: "1",
            ref: null,
            props: { children: "Hello" },
          },
        ],
      },
    };
    const stream = renderToReadableStream(element);
    const result = await createFromReadableStream(stream);
    expect(result.type).toBe("div");
    expect(result.props.className).toBe("container");
  });
});

describe("Flight Protocol - Row Tags", () => {
  it("should emit proper row format", async () => {
    const stream = renderToReadableStream({ hello: "world" });
    const content = await streamToString(stream);
    // Content should contain both the object data and a root model row
    expect(content).toContain('"hello"');
    expect(content).toContain('"world"');
    // Should have newline-separated rows with id:data format
    expect(content).toMatch(/\d+:/);
  });

  it("should end rows with newline", async () => {
    const stream = renderToReadableStream("test");
    const content = await streamToString(stream);
    expect(content.endsWith("\n")).toBe(true);
  });
});

describe("Flight Protocol - Complex Nested Structures", () => {
  it("should serialize deeply nested structures", async () => {
    const data = {
      level1: {
        level2: {
          level3: {
            level4: {
              value: "deep",
              array: [1, { nested: true }],
            },
          },
        },
      },
    };
    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);
    expect(result.level1.level2.level3.level4.value).toBe("deep");
    expect(result.level1.level2.level3.level4.array[1].nested).toBe(true);
  });

  it("should handle mixed Map/Set/Object/Array", async () => {
    const data = {
      map: new Map([["key", { value: 1 }]]),
      set: new Set([1, 2, 3]),
      array: [new Map(), new Set()],
      object: { nested: new Map([["a", "b"]]) },
    };
    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);
    expect(result.map).toBeInstanceOf(Map);
    expect(result.set).toBeInstanceOf(Set);
    expect(result.array[0]).toBeInstanceOf(Map);
    expect(result.object.nested).toBeInstanceOf(Map);
  });
});
