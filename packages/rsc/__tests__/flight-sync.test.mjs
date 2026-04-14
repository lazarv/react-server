/**
 * @lazarv/rsc - Sync API Tests (syncToBuffer / syncFromBuffer)
 *
 * Verifies that syncToBuffer and syncFromBuffer correctly round-trip
 * all RSC-supported types synchronously, and that async types
 * (Promises, ReadableStream, AsyncIterable) are preserved as
 * Promises/wrappers in the deserialized output.
 */

import { describe, expect, it } from "vitest";

import { syncFromBuffer } from "../client/index.mjs";
import { registerServerReference, syncToBuffer } from "../server/index.mjs";

// Helper: round-trip a value through syncToBuffer → syncFromBuffer
function roundTrip(value, serverOptions, clientOptions) {
  const buffer = syncToBuffer(value, serverOptions);
  return syncFromBuffer(buffer, clientOptions);
}

// ── Primitives ──────────────────────────────────────────────────────

describe("syncToBuffer / syncFromBuffer - Primitives", () => {
  it("should round-trip null", () => {
    expect(roundTrip(null)).toBe(null);
  });

  it("should round-trip undefined", () => {
    expect(roundTrip(undefined)).toBeUndefined();
  });

  it("should round-trip boolean true", () => {
    expect(roundTrip(true)).toBe(true);
  });

  it("should round-trip boolean false", () => {
    expect(roundTrip(false)).toBe(false);
  });

  it("should round-trip positive integer", () => {
    expect(roundTrip(42)).toBe(42);
  });

  it("should round-trip negative integer", () => {
    expect(roundTrip(-123)).toBe(-123);
  });

  it("should round-trip zero", () => {
    expect(roundTrip(0)).toBe(0);
  });

  it("should round-trip float", () => {
    expect(roundTrip(Math.PI)).toBe(Math.PI);
  });

  it("should round-trip NaN", () => {
    expect(roundTrip(NaN)).toBeNaN();
  });

  it("should round-trip Infinity", () => {
    expect(roundTrip(Infinity)).toBe(Infinity);
  });

  it("should round-trip -Infinity", () => {
    expect(roundTrip(-Infinity)).toBe(-Infinity);
  });

  it("should round-trip -0", () => {
    expect(Object.is(roundTrip(-0), -0)).toBe(true);
  });

  it("should round-trip empty string", () => {
    expect(roundTrip("")).toBe("");
  });

  it("should round-trip regular string", () => {
    expect(roundTrip("hello world")).toBe("hello world");
  });

  it("should round-trip string starting with $", () => {
    expect(roundTrip("$special")).toBe("$special");
  });

  it("should round-trip string starting with @", () => {
    expect(roundTrip("@mention")).toBe("@mention");
  });

  it("should round-trip BigInt", () => {
    expect(roundTrip(BigInt("9007199254740993"))).toBe(
      BigInt("9007199254740993")
    );
  });
});

// ── Built-in Types ──────────────────────────────────────────────────

describe("syncToBuffer / syncFromBuffer - Built-in Types", () => {
  it("should round-trip Date and preserve type", () => {
    const date = new Date("2026-03-25T12:00:00.000Z");
    const result = roundTrip(date);
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe("2026-03-25T12:00:00.000Z");
  });

  it("should round-trip RegExp", () => {
    const regex = /foo.*bar/gi;
    const result = roundTrip(regex);
    expect(result).toBeInstanceOf(RegExp);
    expect(result.source).toBe("foo.*bar");
    expect(result.flags).toBe("gi");
  });

  it("should round-trip Symbol.for()", () => {
    const sym = Symbol.for("my.symbol");
    const result = roundTrip(sym);
    expect(result).toBe(Symbol.for("my.symbol"));
  });

  it("should round-trip URL", () => {
    const url = new URL("https://example.com/path?q=1#hash");
    const result = roundTrip(url);
    expect(result).toBeInstanceOf(URL);
    expect(result.href).toBe("https://example.com/path?q=1#hash");
  });

  it("should round-trip URLSearchParams", () => {
    const params = new URLSearchParams();
    params.append("a", "1");
    params.append("b", "2");
    params.append("a", "3"); // duplicate key
    const result = roundTrip(params);
    expect(result).toBeInstanceOf(URLSearchParams);
    expect(result.getAll("a")).toEqual(["1", "3"]);
    expect(result.get("b")).toBe("2");
  });

  it("should round-trip Error", () => {
    const err = new Error("something broke");
    const result = roundTrip(err);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("something broke");
    expect(result.stack).toBeDefined();
  });

  it("should round-trip TypeError", () => {
    const err = new TypeError("bad type");
    const result = roundTrip(err);
    expect(result).toBeInstanceOf(TypeError);
    expect(result.message).toBe("bad type");
  });

  it("should round-trip Map", () => {
    const map = new Map([
      ["a", 1],
      ["b", 2],
      [3, "three"],
    ]);
    const result = roundTrip(map);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(3);
    expect(result.get("a")).toBe(1);
    expect(result.get("b")).toBe(2);
    expect(result.get(3)).toBe("three");
  });

  it("should round-trip Set", () => {
    const set = new Set([1, "two", 3, true]);
    const result = roundTrip(set);
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(4);
    expect(result.has(1)).toBe(true);
    expect(result.has("two")).toBe(true);
    expect(result.has(3)).toBe(true);
    expect(result.has(true)).toBe(true);
  });

  it("should round-trip FormData (no Blobs)", () => {
    const form = new FormData();
    form.append("name", "Alice");
    form.append("age", "30");
    const result = roundTrip(form);
    expect(result).toBeInstanceOf(FormData);
    expect(result.get("name")).toBe("Alice");
    expect(result.get("age")).toBe("30");
  });
});

// ── TypedArrays and ArrayBuffer ─────────────────────────────────────

describe("syncToBuffer / syncFromBuffer - Binary Types", () => {
  it("should round-trip Uint8Array", () => {
    const arr = new Uint8Array([1, 2, 3, 4, 5]);
    const result = roundTrip(arr);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual([1, 2, 3, 4, 5]);
  });

  it("should round-trip Int32Array", () => {
    const arr = new Int32Array([100, -200, 300]);
    const result = roundTrip(arr);
    expect(result).toBeInstanceOf(Int32Array);
    expect(Array.from(result)).toEqual([100, -200, 300]);
  });

  it("should round-trip Float64Array", () => {
    const arr = new Float64Array([1.1, 2.2, 3.3]);
    const result = roundTrip(arr);
    expect(result).toBeInstanceOf(Float64Array);
    expect(Array.from(result)).toEqual([1.1, 2.2, 3.3]);
  });

  it("should round-trip ArrayBuffer", () => {
    const buf = new Uint8Array([10, 20, 30]).buffer;
    const result = roundTrip(buf);
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(result))).toEqual([10, 20, 30]);
  });

  it("should round-trip empty Uint8Array", () => {
    const arr = new Uint8Array([]);
    const result = roundTrip(arr);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(0);
  });
});

// ── Objects and Arrays ──────────────────────────────────────────────

describe("syncToBuffer / syncFromBuffer - Objects and Arrays", () => {
  it("should round-trip plain object", () => {
    const obj = { a: 1, b: "hello", c: true };
    const result = roundTrip(obj);
    expect(result).toEqual({ a: 1, b: "hello", c: true });
  });

  it("should round-trip nested objects", () => {
    const obj = { outer: { inner: { deep: 42 } } };
    const result = roundTrip(obj);
    expect(result.outer.inner.deep).toBe(42);
  });

  it("should round-trip array", () => {
    const arr = [1, "two", true, null];
    const result = roundTrip(arr);
    expect(result).toEqual([1, "two", true, null]);
  });

  it("should round-trip nested arrays", () => {
    const arr = [
      [1, 2],
      [3, [4, 5]],
    ];
    const result = roundTrip(arr);
    expect(result).toEqual([
      [1, 2],
      [3, [4, 5]],
    ]);
  });

  it("should round-trip empty object", () => {
    expect(roundTrip({})).toEqual({});
  });

  it("should round-trip empty array", () => {
    expect(roundTrip([])).toEqual([]);
  });

  it("should round-trip object with mixed value types", () => {
    const obj = {
      str: "hello",
      num: 42,
      bool: false,
      nil: null,
      undef: undefined,
      date: new Date("2026-01-01T00:00:00.000Z"),
      regex: /test/i,
      bigint: BigInt(123),
      sym: Symbol.for("test"),
      url: new URL("https://example.com"),
      set: new Set([1, 2]),
      map: new Map([["k", "v"]]),
    };
    const result = roundTrip(obj);
    expect(result.str).toBe("hello");
    expect(result.num).toBe(42);
    expect(result.bool).toBe(false);
    expect(result.nil).toBe(null);
    expect(result.undef).toBeUndefined();
    expect(result.date).toBeInstanceOf(Date);
    expect(result.date.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(result.regex).toBeInstanceOf(RegExp);
    expect(result.regex.source).toBe("test");
    expect(result.bigint).toBe(BigInt(123));
    expect(result.sym).toBe(Symbol.for("test"));
    expect(result.url).toBeInstanceOf(URL);
    expect(result.set).toBeInstanceOf(Set);
    expect(result.set.size).toBe(2);
    expect(result.map).toBeInstanceOf(Map);
    expect(result.map.get("k")).toBe("v");
  });
});

// ── Map and Set with complex values ─────────────────────────────────

describe("syncToBuffer / syncFromBuffer - Complex Map/Set", () => {
  it("should round-trip Map with Date values", () => {
    const map = new Map([
      ["created", new Date("2026-01-01T00:00:00.000Z")],
      ["updated", new Date("2026-03-25T12:00:00.000Z")],
    ]);
    const result = roundTrip(map);
    expect(result).toBeInstanceOf(Map);
    expect(result.get("created")).toBeInstanceOf(Date);
    expect(result.get("updated")).toBeInstanceOf(Date);
    expect(result.get("created").toISOString()).toBe(
      "2026-01-01T00:00:00.000Z"
    );
  });

  it("should round-trip Set with mixed types", () => {
    const set = new Set(["a", 1, true, null]);
    const result = roundTrip(set);
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(4);
    expect(result.has("a")).toBe(true);
    expect(result.has(null)).toBe(true);
  });

  it("should round-trip nested Map inside object", () => {
    const obj = {
      data: new Map([["key", { nested: true }]]),
    };
    const result = roundTrip(obj);
    expect(result.data).toBeInstanceOf(Map);
    expect(result.data.get("key")).toEqual({ nested: true });
  });
});

// ── Async types (remain as Promises) ────────────────────────────────

describe("syncToBuffer / syncFromBuffer - Async Types", () => {
  it("should serialize a Promise and deserialize as a Promise", async () => {
    const value = { data: Promise.resolve(42) };
    const buffer = syncToBuffer(value);
    const result = syncFromBuffer(buffer);
    // The promise reference becomes a Promise in the output
    expect(result.data).toBeDefined();
    expect(typeof result.data.then).toBe("function");
    // The promise resolves asynchronously (the resolution chunk is NOT
    // in the sync buffer), so it will remain pending.
    // We just verify it's a thenable.
  });

  it("should handle a root-level resolved value (not a Promise)", () => {
    const buffer = syncToBuffer("simple");
    const result = syncFromBuffer(buffer);
    expect(result).toBe("simple");
  });
});

// ── Server References ───────────────────────────────────────────────

describe("syncToBuffer / syncFromBuffer - Server References", () => {
  it("should round-trip a server reference", () => {
    function myAction() {}
    const ref = registerServerReference(myAction, "module", "myAction");

    const buffer = syncToBuffer(ref);
    const result = syncFromBuffer(buffer, {
      callServer: () => Promise.resolve(),
    });

    // Server references are deserialized as functions
    expect(typeof result).toBe("function");
  });

  it("should round-trip a server reference with bound args", () => {
    function myAction() {}
    const ref = registerServerReference(myAction, "module", "myAction");
    const boundRef = ref.bind(null, 1, "two", true);

    const buffer = syncToBuffer(boundRef);
    const result = syncFromBuffer(buffer, {
      callServer: () => Promise.resolve(),
    });

    expect(typeof result).toBe("function");
  });
});

// ── Edge cases ──────────────────────────────────────────────────────

describe("syncToBuffer / syncFromBuffer - Edge Cases", () => {
  it("should produce a Uint8Array from syncToBuffer", () => {
    const buffer = syncToBuffer({ test: true });
    expect(buffer).toBeInstanceOf(Uint8Array);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("should accept ArrayBuffer in syncFromBuffer", () => {
    const buffer = syncToBuffer(42);
    // Pass as ArrayBuffer instead of Uint8Array
    const result = syncFromBuffer(buffer.buffer);
    expect(result).toBe(42);
  });

  it("should round-trip deeply nested structure", () => {
    const deep = { a: { b: { c: { d: { e: { f: 99 } } } } } };
    const result = roundTrip(deep);
    expect(result.a.b.c.d.e.f).toBe(99);
  });

  it("should round-trip large array", () => {
    const arr = Array.from({ length: 1000 }, (_, i) => i);
    const result = roundTrip(arr);
    expect(result).toHaveLength(1000);
    expect(result[0]).toBe(0);
    expect(result[999]).toBe(999);
  });

  it("should round-trip object with many keys", () => {
    const obj = {};
    for (let i = 0; i < 100; i++) {
      obj[`key_${i}`] = i;
    }
    const result = roundTrip(obj);
    expect(Object.keys(result)).toHaveLength(100);
    expect(result.key_0).toBe(0);
    expect(result.key_99).toBe(99);
  });

  it("should round-trip string with unicode", () => {
    const str = "Hello 🌍 こんにちは العالم";
    expect(roundTrip(str)).toBe(str);
  });

  it("should round-trip string with newlines and special chars", () => {
    const str = "line1\nline2\ttab\r\nwindows";
    expect(roundTrip(str)).toBe(str);
  });

  it("should resolve error row at root as ErrorThrower element", () => {
    // Error rows at id=0 resolve with an ErrorThrower element (matching
    // react-server-dom-webpack behavior where the transport promise always
    // resolves and errors propagate via React's render pipeline).
    const errorPayload = `0:E{"message":"test error"}\n`;
    const bytes = new TextEncoder().encode(errorPayload);

    const result = syncFromBuffer(bytes);

    // Root resolves to an ErrorThrower React element
    expect(result.$$typeof).toBe(Symbol.for("react.transitional.element"));
    expect(result.type.displayName).toBe("FlightError");
    expect(() => result.type()).toThrow("test error");

    // Swallow the async rejection that leaks from the internal chunk promise
    return new Promise((resolve) => setTimeout(resolve, 10));
  });
});

// ── Comparison with JSON (proving RSC serialization preserves types) ─

describe("syncToBuffer / syncFromBuffer vs JSON - Type Preservation", () => {
  it("Date survives RSC round-trip but not JSON round-trip", () => {
    const date = new Date("2026-06-15T10:30:00.000Z");

    // RSC preserves the Date type
    const rscResult = roundTrip(date);
    expect(rscResult).toBeInstanceOf(Date);

    // JSON loses the Date type (becomes a string)
    const jsonResult = JSON.parse(JSON.stringify(date));
    expect(jsonResult).not.toBeInstanceOf(Date);
    expect(typeof jsonResult).toBe("string");
  });

  it("Map survives RSC round-trip but not JSON round-trip", () => {
    const map = new Map([["key", "value"]]);

    // RSC preserves the Map type
    const rscResult = roundTrip(map);
    expect(rscResult).toBeInstanceOf(Map);
    expect(rscResult.get("key")).toBe("value");

    // JSON loses the Map entirely (becomes empty object)
    const jsonResult = JSON.parse(JSON.stringify(map));
    expect(jsonResult).not.toBeInstanceOf(Map);
  });

  it("Set survives RSC round-trip but not JSON round-trip", () => {
    const set = new Set([1, 2, 3]);

    // RSC preserves the Set type
    const rscResult = roundTrip(set);
    expect(rscResult).toBeInstanceOf(Set);
    expect(rscResult.size).toBe(3);

    // JSON loses the Set entirely (becomes empty object)
    const jsonResult = JSON.parse(JSON.stringify(set));
    expect(jsonResult).not.toBeInstanceOf(Set);
  });

  it("RegExp survives RSC round-trip but not JSON round-trip", () => {
    const regex = /test/gi;

    // RSC preserves the RegExp type
    const rscResult = roundTrip(regex);
    expect(rscResult).toBeInstanceOf(RegExp);
    expect(rscResult.source).toBe("test");
    expect(rscResult.flags).toBe("gi");

    // JSON loses the RegExp (becomes empty object)
    const jsonResult = JSON.parse(JSON.stringify(regex));
    expect(jsonResult).not.toBeInstanceOf(RegExp);
  });

  it("BigInt survives RSC round-trip but throws with JSON", () => {
    const bigint = BigInt("12345678901234567890");

    // RSC preserves BigInt
    const rscResult = roundTrip(bigint);
    expect(rscResult).toBe(bigint);

    // JSON throws on BigInt
    expect(() => JSON.stringify(bigint)).toThrow();
  });

  it("undefined in object survives RSC round-trip but not JSON", () => {
    const obj = { a: 1, b: undefined, c: 3 };

    // RSC preserves undefined values
    const rscResult = roundTrip(obj);
    expect("b" in rscResult).toBe(true);
    expect(rscResult.b).toBeUndefined();

    // JSON strips undefined values
    const jsonResult = JSON.parse(JSON.stringify(obj));
    expect("b" in jsonResult).toBe(false);
  });

  it("NaN survives RSC round-trip but becomes null in JSON", () => {
    const obj = { value: NaN };

    // RSC preserves NaN
    const rscResult = roundTrip(obj);
    expect(rscResult.value).toBeNaN();

    // JSON turns NaN into null
    const jsonResult = JSON.parse(JSON.stringify(obj));
    expect(jsonResult.value).toBe(null);
  });

  it("-0 survives RSC round-trip but becomes 0 in JSON", () => {
    // RSC preserves -0
    const rscResult = roundTrip(-0);
    expect(Object.is(rscResult, -0)).toBe(true);

    // JSON loses the sign
    const jsonResult = JSON.parse(JSON.stringify(-0));
    expect(Object.is(jsonResult, -0)).toBe(false);
    expect(jsonResult).toBe(0);
  });

  it("Infinity survives RSC round-trip but becomes null in JSON", () => {
    const obj = { value: Infinity };

    // RSC preserves Infinity
    const rscResult = roundTrip(obj);
    expect(rscResult.value).toBe(Infinity);

    // JSON turns Infinity into null
    const jsonResult = JSON.parse(JSON.stringify(obj));
    expect(jsonResult.value).toBe(null);
  });

  it("complex nested structure with mixed types preserves all types", () => {
    const value = {
      users: [
        {
          name: "Alice",
          joinedAt: new Date("2025-01-01T00:00:00.000Z"),
          tags: new Set(["admin", "user"]),
          metadata: new Map([
            ["score", 100],
            ["level", 5],
          ]),
          id: BigInt(1),
          pattern: /alice/i,
        },
      ],
      config: {
        timeout: Infinity,
        delta: -0,
        missing: undefined,
        invalid: NaN,
      },
    };

    const result = roundTrip(value);

    // Verify all types are preserved
    expect(result.users[0].name).toBe("Alice");
    expect(result.users[0].joinedAt).toBeInstanceOf(Date);
    expect(result.users[0].tags).toBeInstanceOf(Set);
    expect(result.users[0].tags.has("admin")).toBe(true);
    expect(result.users[0].metadata).toBeInstanceOf(Map);
    expect(result.users[0].metadata.get("score")).toBe(100);
    expect(result.users[0].id).toBe(BigInt(1));
    expect(result.users[0].pattern).toBeInstanceOf(RegExp);
    expect(result.config.timeout).toBe(Infinity);
    expect(Object.is(result.config.delta, -0)).toBe(true);
    expect(result.config.missing).toBeUndefined();
    expect(result.config.invalid).toBeNaN();
  });
});
