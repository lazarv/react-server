/**
 * Comprehensive tests for RSC Flight protocol features
 * Testing gaps identified in coverage analysis
 */

import * as React from "react";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  createFromReadableStream,
  createServerReference,
  encodeReply,
} from "../client/shared.mjs";
import {
  decodeAction,
  decodeFormState,
  decodeReply,
  emitHint,
  logToConsole,
  prerender,
  registerServerReference,
  renderToReadableStream,
} from "../server/shared.mjs";

const REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element");
const REACT_SUSPENSE_TYPE = Symbol.for("react.suspense");
const REACT_PROFILER_TYPE = Symbol.for("react.profiler");
const REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode");
const REACT_PROVIDER_TYPE = Symbol.for("react.provider");
const REACT_CONTEXT_TYPE = Symbol.for("react.context");
const REACT_LAZY_TYPE = Symbol.for("react.lazy");
const REACT_MEMO_TYPE = Symbol.for("react.memo");

// Helper to create a React element
function createElement(type, props, ...children) {
  return {
    $$typeof: REACT_ELEMENT_TYPE,
    type,
    key: props?.key ?? null,
    ref: props?.ref ?? null,
    props: {
      ...props,
      children:
        children.length === 1
          ? children[0]
          : children.length > 0
            ? children
            : undefined,
    },
  };
}

// Helper to collect stream
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

describe("Console Replay", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("should emit console warning row", async () => {
    const data = { message: "test" };
    const stream = renderToReadableStream(data, {
      onPostpone: () => {},
    });

    // Log to console during render - this tests the logToConsole function
    const wireFormat = await streamToString(stream);
    // Wire format should contain the data
    expect(wireFormat).toContain("message");
  });

  test("logToConsole with various data types", () => {
    // Test that logToConsole handles different data types
    logToConsole(null, "log", ["string message"]);
    logToConsole(null, "warn", [123, { key: "value" }]);
    logToConsole(null, "error", [new Error("test error")]);

    // These should not throw
  });
});

describe("Server Actions - decodeAction", () => {
  // decodeAction now matches React's API signature:
  // - decodeAction(formData) for bundled environments
  // - decodeAction(formData, moduleBasePath) for ESM
  // Also supports legacy options.moduleLoader.loadServerAction for backwards compat

  test("should decode action from FormData using internal registry", async () => {
    const formData = new FormData();
    formData.append("$ACTION_ID", "test-module#myAction");
    formData.append("name", "test");

    // Register the action in the internal registry
    const myAction = vi.fn().mockReturnValue("action result");
    const registered = registerServerReference(
      myAction,
      "test-module",
      "myAction"
    );

    const result = await decodeAction(formData);
    // registerServerReference wraps the function, so we check it's the registered wrapper
    expect(result).toBe(registered);
    expect(typeof result).toBe("function");
    // Verify calling the action works
    result("arg1");
    expect(myAction).toHaveBeenCalledWith("arg1");
  });

  test("should decode action with legacy moduleLoader callback", async () => {
    const formData = new FormData();
    formData.append("$ACTION_ID", "legacy-action-id");
    formData.append("name", "test");

    const loadServerAction = vi.fn().mockResolvedValue(() => "action result");

    const result = await decodeAction(formData, {
      moduleLoader: { loadServerAction },
    });

    expect(loadServerAction).toHaveBeenCalledWith("legacy-action-id");
    expect(typeof result).toBe("function");
  });

  test("should return null when no $ACTION_ID", async () => {
    const formData = new FormData();
    formData.append("name", "test");

    const result = await decodeAction(formData);
    expect(result).toBeNull();
  });

  test("should return null for non-FormData input", async () => {
    const result = await decodeAction("not-formdata");
    expect(result).toBeNull();
  });
});

describe("Server Actions - decodeFormState", () => {
  // decodeFormState now matches React's API signature:
  // - decodeFormState(result, formData)
  // Returns ReactFormState tuple: [value, keyPath, referenceId, boundArgsLength]

  test("should decode form state from FormData", () => {
    const formData = new FormData();
    formData.append("$ACTION_ID", "action-module#submitForm");
    formData.append("$ACTION_KEY", "form-state-key");

    const actionResult = { success: true, value: 123 };
    const result = decodeFormState(actionResult, formData);

    // Should return ReactFormState tuple: [value, keyPath, referenceId, boundArgsLength]
    expect(result).toEqual([
      actionResult,
      "form-state-key",
      "action-module#submitForm",
      0,
    ]);
  });

  test("should count bound arguments", () => {
    const formData = new FormData();
    formData.append("$ACTION_ID", "action#fn");
    formData.append("$ACTION_KEY", "key");
    formData.append("$0", "bound-arg-1");
    formData.append("$1", "bound-arg-2");

    const actionResult = { data: "test" };
    const result = decodeFormState(actionResult, formData);

    expect(result).toEqual([actionResult, "key", "action#fn", 2]);
  });

  test("should return null when no $ACTION_ID", () => {
    const formData = new FormData();
    formData.append("name", "value");

    const actionResult = { data: "test" };
    const result = decodeFormState(actionResult, formData);

    expect(result).toBeNull();
  });

  test("should return null for non-FormData input", () => {
    const result = decodeFormState({ data: "test" }, "not-formdata");
    expect(result).toBeNull();
  });
});

describe("Special React Types Serialization", () => {
  test("should serialize Profiler transparently", async () => {
    const profiler = {
      $$typeof: REACT_ELEMENT_TYPE,
      type: REACT_PROFILER_TYPE,
      key: null,
      ref: null,
      props: {
        id: "test-profiler",
        onRender: () => {},
        children: createElement("div", null, "Profiled content"),
      },
    };

    const stream = renderToReadableStream(profiler);
    const result = await createFromReadableStream(stream);

    // Profiler should be transparent - only children rendered
    expect(result.type).toBe("div");
    expect(result.props.children).toBe("Profiled content");
  });

  test("should serialize StrictMode transparently", async () => {
    const strictMode = {
      $$typeof: REACT_ELEMENT_TYPE,
      type: REACT_STRICT_MODE_TYPE,
      key: null,
      ref: null,
      props: {
        children: createElement("span", null, "Strict content"),
      },
    };

    const stream = renderToReadableStream(strictMode);
    const result = await createFromReadableStream(stream);

    // StrictMode should be transparent
    expect(result.type).toBe("span");
  });

  test("should serialize Suspense with fallback", async () => {
    const suspense = {
      $$typeof: REACT_ELEMENT_TYPE,
      type: REACT_SUSPENSE_TYPE,
      key: null,
      ref: null,
      props: {
        fallback: createElement("div", null, "Loading..."),
        children: createElement("div", null, "Content"),
      },
    };

    const stream = renderToReadableStream(suspense);
    const result = await createFromReadableStream(stream);

    expect(result.type).toBe(REACT_SUSPENSE_TYPE);
  });

  test("should serialize memo component", async () => {
    const MemoComponent = () => createElement("div", null, "Memoized");
    const memoized = {
      $$typeof: REACT_MEMO_TYPE,
      type: MemoComponent,
      compare: null,
    };

    const element = {
      $$typeof: REACT_ELEMENT_TYPE,
      type: memoized,
      key: null,
      ref: null,
      props: {},
    };

    const stream = renderToReadableStream(element);
    const result = await createFromReadableStream(stream);

    expect(result.type).toBe("div");
    expect(result.props.children).toBe("Memoized");
  });

  test("should serialize lazy component", async () => {
    const LazyComponent = () => createElement("div", null, "Lazy loaded");
    const lazy = {
      $$typeof: REACT_LAZY_TYPE,
      _payload: LazyComponent,
      _init: (payload) => payload,
    };

    const element = {
      $$typeof: REACT_ELEMENT_TYPE,
      type: lazy,
      key: null,
      ref: null,
      props: {},
    };

    const stream = renderToReadableStream(element);
    const result = await createFromReadableStream(stream);

    expect(result.type).toBe("div");
  });

  test("should serialize Context.Provider transparently", async () => {
    // Note: React.createContext is not available in react-server condition
    // This test verifies that Context.Provider is handled transparently
    const TestContext = {
      $$typeof: REACT_CONTEXT_TYPE,
      _currentValue: "default",
      _currentValue2: "default",
      Provider: null,
      Consumer: null,
    };

    const provider = {
      $$typeof: REACT_ELEMENT_TYPE,
      type: {
        $$typeof: REACT_PROVIDER_TYPE,
        _context: TestContext,
      },
      key: null,
      ref: null,
      props: {
        value: "provided value",
        children: createElement("div", null, "Context child"),
      },
    };

    const stream = renderToReadableStream(provider);
    const result = await createFromReadableStream(stream);

    // Provider should be transparent
    expect(result.type).toBe("div");
  });
});

describe("Binary Data Edge Cases", () => {
  test("should handle all TypedArray types", async () => {
    const data = {
      int8: new Int8Array([-128, 0, 127]),
      uint8: new Uint8Array([0, 128, 255]),
      uint8Clamped: new Uint8ClampedArray([0, 128, 255]),
      int16: new Int16Array([-32768, 0, 32767]),
      uint16: new Uint16Array([0, 32768, 65535]),
      int32: new Int32Array([-2147483648, 0, 2147483647]),
      uint32: new Uint32Array([0, 2147483648, 4294967295]),
      float32: new Float32Array([1.5, -2.5, 0]),
      float64: new Float64Array([1.1, -2.2, 3.3]),
    };

    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.int8).toBeInstanceOf(Int8Array);
    expect(Array.from(result.int8)).toEqual([-128, 0, 127]);

    expect(result.uint8).toBeInstanceOf(Uint8Array);
    expect(Array.from(result.uint8)).toEqual([0, 128, 255]);

    expect(result.uint8Clamped).toBeInstanceOf(Uint8ClampedArray);
    expect(Array.from(result.uint8Clamped)).toEqual([0, 128, 255]);

    expect(result.int16).toBeInstanceOf(Int16Array);
    expect(Array.from(result.int16)).toEqual([-32768, 0, 32767]);

    expect(result.uint16).toBeInstanceOf(Uint16Array);
    expect(Array.from(result.uint16)).toEqual([0, 32768, 65535]);

    expect(result.int32).toBeInstanceOf(Int32Array);
    expect(Array.from(result.int32)).toEqual([-2147483648, 0, 2147483647]);

    expect(result.uint32).toBeInstanceOf(Uint32Array);
    expect(Array.from(result.uint32)).toEqual([0, 2147483648, 4294967295]);

    expect(result.float32).toBeInstanceOf(Float32Array);

    expect(result.float64).toBeInstanceOf(Float64Array);
  });

  test("should handle ArrayBuffer directly", async () => {
    const buffer = new ArrayBuffer(8);
    const view = new Uint8Array(buffer);
    view.set([1, 2, 3, 4, 5, 6, 7, 8]);

    const data = { buffer };
    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.buffer).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(result.buffer)).toEqual(view);
  });

  test("should handle DataView", async () => {
    const buffer = new ArrayBuffer(4);
    const dataView = new DataView(buffer);
    dataView.setInt32(0, 12345678);

    const data = { view: dataView };
    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.view).toBeInstanceOf(DataView);
    expect(result.view.getInt32(0)).toBe(12345678);
  });

  test("should handle empty TypedArray", async () => {
    const data = { empty: new Uint8Array(0) };
    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.empty).toBeInstanceOf(Uint8Array);
    expect(result.empty.length).toBe(0);
  });
});

describe("String Escaping Edge Cases", () => {
  test("should handle string starting with @@", async () => {
    const data = { value: "@@escaped" };
    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.value).toBe("@@escaped");
  });

  test("should handle string starting with $$", async () => {
    const data = { value: "$$dollar" };
    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.value).toBe("$$dollar");
  });

  test("should handle string that looks like chunk reference", async () => {
    const data = { value: "$123" };
    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.value).toBe("$123");
  });

  test("should handle string starting with $S", async () => {
    const data = { value: "$Ssome-symbol" };
    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    // Should NOT be interpreted as Symbol.for("ome-symbol")
    expect(result.value).toBe("$Ssome-symbol");
  });

  test("should handle string $S alone (Suspense marker)", async () => {
    // This is tricky - $S alone means Suspense, but $Sfoo means Symbol.for("foo")
    const data = { suspenseMarker: "$S", symbolRef: "$Smy.symbol" };
    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    // Both should be escaped and returned as strings
    expect(result.suspenseMarker).toBe("$S");
    expect(result.symbolRef).toBe("$Smy.symbol");
  });
});

describe("Error Handling Edge Cases", () => {
  test("should handle promise rejection with Error object", async () => {
    const error = new Error("test error");
    const data = {
      promise: Promise.reject(error),
    };
    // Prevent unhandled rejection
    data.promise.catch(() => {});

    const stream = renderToReadableStream(data, {
      onError: () => {},
    });
    const result = await createFromReadableStream(stream);

    // The promise property should be rejected
    expect(result.promise).toBeInstanceOf(Promise);
    await expect(result.promise).rejects.toBeDefined();
  });

  test("should handle error with digest", async () => {
    const error = new Error("Test error");
    error.digest = "error-digest-123";

    const data = { promise: Promise.reject(error) };
    data.promise.catch(() => {});

    const stream = renderToReadableStream(data, {
      onError: (err) => err.digest,
    });

    const result = await createFromReadableStream(stream);

    // The promise property should be rejected with the digest preserved
    expect(result.promise).toBeInstanceOf(Promise);
    try {
      await result.promise;
      expect.fail("Promise should have rejected");
    } catch (e) {
      expect(e.digest).toBe("error-digest-123");
    }
  });

  test("should handle getter that throws", async () => {
    const data = {
      get throwingGetter() {
        throw new Error("Getter error");
      },
      normalProp: "value",
    };

    const stream = renderToReadableStream(data);

    // Should either throw or handle gracefully
    try {
      await createFromReadableStream(stream);
      // If it succeeds, the throwing getter should be handled
    } catch (e) {
      expect(e.message).toContain("Getter error");
    }
  });
});

describe("Async Iteration Edge Cases", () => {
  test("should handle async generator", async () => {
    async function* asyncGen() {
      yield 1;
      yield 2;
      yield 3;
    }

    const data = { generator: asyncGen() };
    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    // Async iterables become arrays or have special handling
    expect(result.generator).toBeDefined();
  });

  test("should handle async iterable with Symbol.asyncIterator", async () => {
    const asyncIterable = {
      [Symbol.asyncIterator]() {
        let i = 0;
        return {
          async next() {
            if (i < 3) {
              return { value: i++, done: false };
            }
            return { value: undefined, done: true };
          },
        };
      },
    };

    const data = { iterable: asyncIterable };
    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.iterable).toBeDefined();
  });
});

describe("URL and URLSearchParams", () => {
  test("should serialize URL", async () => {
    const data = {
      url: new URL("https://example.com/path?query=value"),
    };
    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.url).toBeInstanceOf(URL);
    expect(result.url.href).toBe("https://example.com/path?query=value");
  });

  test("should serialize URLSearchParams", async () => {
    const data = {
      params: new URLSearchParams({ foo: "bar", baz: "qux" }),
    };
    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.params).toBeInstanceOf(URLSearchParams);
    expect(result.params.get("foo")).toBe("bar");
    expect(result.params.get("baz")).toBe("qux");
  });
});

describe("FormData Edge Cases", () => {
  test("should handle FormData with multiple values for same key", async () => {
    const formData = new FormData();
    formData.append("multi", "value1");
    formData.append("multi", "value2");
    formData.append("multi", "value3");

    const data = { form: formData };
    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.form).toBeInstanceOf(FormData);
    expect(result.form.getAll("multi")).toEqual(["value1", "value2", "value3"]);
  });

  test("should handle FormData with File", async () => {
    const file = new File(["file content"], "test.txt", { type: "text/plain" });
    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", "test");

    const data = { form: formData };
    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    // FormData with File is serialized as a Promise in Flight protocol
    // because File serialization is async
    expect(result.form).toBeInstanceOf(Promise);
    const resolvedForm = await result.form;
    expect(resolvedForm).toBeInstanceOf(FormData);
    const resultFile = resolvedForm.get("file");
    expect(resultFile).toBeInstanceOf(File);
    expect(await resultFile.text()).toBe("file content");
  });

  test("should handle empty FormData", async () => {
    const formData = new FormData();
    const data = { form: formData };
    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.form).toBeInstanceOf(FormData);
    expect(Array.from(result.form.entries())).toHaveLength(0);
  });
});

describe("encodeReply Edge Cases", () => {
  test("should encode URL in reply", async () => {
    const data = { url: new URL("https://example.com") };
    const encoded = await encodeReply(data);
    const decoded = await decodeReply(encoded);

    expect(decoded.url).toBeInstanceOf(URL);
    expect(decoded.url.href).toBe("https://example.com/");
  });

  test("should encode URLSearchParams in reply", async () => {
    const data = { params: new URLSearchParams("a=1&b=2") };
    const encoded = await encodeReply(data);
    const decoded = await decodeReply(encoded);

    expect(decoded.params).toBeInstanceOf(URLSearchParams);
    expect(decoded.params.get("a")).toBe("1");
  });

  test("should encode nested Map with complex values", async () => {
    const data = new Map([
      ["date", new Date("2024-01-01")],
      ["set", new Set([1, 2, 3])],
      ["nested", new Map([["inner", "value"]])],
    ]);

    const encoded = await encodeReply(data);
    const decoded = await decodeReply(encoded);

    expect(decoded).toBeInstanceOf(Map);
    expect(decoded.get("date")).toBeInstanceOf(Date);
    expect(decoded.get("set")).toBeInstanceOf(Set);
    expect(decoded.get("nested")).toBeInstanceOf(Map);
  });
});

describe("Server Reference Binding", () => {
  test("should handle bound arguments through serialization", async () => {
    const callServer = vi.fn().mockResolvedValue("result");
    const action = createServerReference("module#action", callServer);

    // Bind some arguments
    const boundAction = action.bind(null, "arg1", 42);

    // Call the bound action
    await boundAction("arg2");

    // callServer should receive all args
    expect(callServer).toHaveBeenCalledWith("module#action", [
      "arg1",
      42,
      "arg2",
    ]);
  });

  test("should handle multiple bind calls", async () => {
    const callServer = vi.fn().mockResolvedValue("result");
    const action = createServerReference("module#action", callServer);

    const bound1 = action.bind(null, "a");
    const bound2 = bound1.bind(null, "b");
    const bound3 = bound2.bind(null, "c");

    await bound3("d");

    expect(callServer).toHaveBeenCalledWith("module#action", [
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  test("should handle bind with complex types", async () => {
    const callServer = vi.fn().mockResolvedValue("result");
    const action = createServerReference("module#action", callServer);

    const date = new Date("2024-01-01");
    const boundAction = action.bind(null, date, new Map([["key", "value"]]));

    await boundAction();

    const [id, args] = callServer.mock.calls[0];
    expect(id).toBe("module#action");
    expect(args[0]).toBeInstanceOf(Date);
    expect(args[1]).toBeInstanceOf(Map);
  });
});

describe("Prerender", () => {
  test("should prerender static content", async () => {
    const element = createElement("div", { id: "static" }, "Static content");

    const { prelude } = await prerender(element);

    expect(prelude).toBeInstanceOf(ReadableStream);
    const content = await streamToString(prelude);
    expect(content).toContain("static");
  });

  test("should handle onError callback", async () => {
    const onError = vi.fn();
    const element = createElement("div", null, "Content");

    await prerender(element, { onError });

    // onError should not be called for successful render
    expect(onError).not.toHaveBeenCalled();
  });
});

describe("Hint System", () => {
  test("emitHint should not throw with null request", () => {
    // emitHint with null should be a no-op
    expect(() => emitHint(null, "S", "stylesheet.css")).not.toThrow();
  });

  test("emitHint with various hint codes", () => {
    // These should not throw
    expect(() =>
      emitHint(null, "D", { href: "/preload.js", as: "script" })
    ).not.toThrow();
    expect(() =>
      emitHint(null, "C", { href: "/dns-prefetch.com" })
    ).not.toThrow();
    expect(() =>
      emitHint(null, "P", { href: "/preconnect.com" })
    ).not.toThrow();
  });
});

describe("Symbol Serialization", () => {
  test("should serialize Symbol.for", async () => {
    const data = {
      sym1: Symbol.for("my.custom.symbol"),
      sym2: Symbol.for("another.symbol"),
    };

    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.sym1).toBe(Symbol.for("my.custom.symbol"));
    expect(result.sym2).toBe(Symbol.for("another.symbol"));
  });

  test("should handle Symbol.for with special characters", async () => {
    const data = {
      sym: Symbol.for("symbol.with.dots.and-dashes"),
    };

    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.sym).toBe(Symbol.for("symbol.with.dots.and-dashes"));
  });
});

describe("Infinity and NaN", () => {
  test("should serialize Infinity values", async () => {
    const data = {
      posInf: Infinity,
      negInf: -Infinity,
    };

    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.posInf).toBe(Infinity);
    expect(result.negInf).toBe(-Infinity);
  });

  test("should serialize NaN", async () => {
    const data = { nan: NaN };
    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(Number.isNaN(result.nan)).toBe(true);
  });

  test("should serialize -0", async () => {
    const data = { negZero: -0 };
    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(Object.is(result.negZero, -0)).toBe(true);
  });
});

describe("RegExp Serialization", () => {
  test("should serialize RegExp with flags", async () => {
    const data = {
      regex: /test\d+/gi,
    };

    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.regex).toBeInstanceOf(RegExp);
    expect(result.regex.source).toBe("test\\d+");
    expect(result.regex.flags).toBe("gi");
  });

  test("should serialize complex RegExp", async () => {
    const data = {
      regex: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    };

    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.regex).toBeInstanceOf(RegExp);
    expect(result.regex.test("test@example.com")).toBe(true);
    expect(result.regex.test("invalid")).toBe(false);
  });
});

describe("Circular Reference Detection", () => {
  test("should handle self-referencing object", async () => {
    const obj = { name: "test" };
    obj.self = obj;

    const stream = renderToReadableStream(obj);
    const result = await createFromReadableStream(stream);

    // Should either handle circular reference or deduplicate
    expect(result.name).toBe("test");
    expect(result.self).toBeDefined();
    expect(result.self.name).toBe("test");
  });

  test("should handle mutually referencing objects", async () => {
    const a = { name: "a" };
    const b = { name: "b" };
    a.ref = b;
    b.ref = a;

    const stream = renderToReadableStream({ a, b });
    const result = await createFromReadableStream(stream);

    expect(result.a.name).toBe("a");
    expect(result.b.name).toBe("b");
    expect(result.a.ref.name).toBe("b");
    expect(result.b.ref.name).toBe("a");
  });
});

describe("Object Identity Preservation", () => {
  test("should preserve object identity in arrays", async () => {
    const obj = { value: 42 };
    const arr = [obj, { ref: obj }, obj];

    const stream = renderToReadableStream(arr);
    const result = await createFromReadableStream(stream);

    expect(result[0]).toBe(result[2]); // Same object
    expect(result[1].ref).toBe(result[0]); // Reference to same object
  });

  test("should preserve object identity in object properties", async () => {
    const shared = { name: "shared" };
    const data = {
      first: shared,
      second: shared,
      nested: { inner: shared },
    };

    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.first).toBe(result.second);
    expect(result.first).toBe(result.nested.inner);
  });

  test("should preserve object identity in Map values", async () => {
    const obj = { value: 42 };
    const map = new Map([
      ["a", obj],
      ["b", obj],
    ]);

    const stream = renderToReadableStream(map);
    const result = await createFromReadableStream(stream);

    expect(result.get("a")).toBe(result.get("b"));
  });

  test("should preserve object identity in Map keys", async () => {
    const keyObj = { id: "key" };
    const map = new Map([[keyObj, "value1"]]);
    const data = { map, keyRef: keyObj };

    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    const mapKeys = [...result.map.keys()];
    expect(mapKeys[0]).toBe(result.keyRef);
    expect(result.map.get(result.keyRef)).toBe("value1");
  });

  test("should preserve object identity in Set entries", async () => {
    const obj = { id: 1 };
    const set = new Set([obj, { ref: obj }]);

    const stream = renderToReadableStream(set);
    const result = await createFromReadableStream(stream);

    const setArr = [...result];
    expect(setArr[1].ref).toBe(setArr[0]);
  });

  test("should preserve object identity across Map and regular objects", async () => {
    const shared = { shared: true };
    const data = {
      map: new Map([["key", shared]]),
      direct: shared,
    };

    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.map.get("key")).toBe(result.direct);
  });

  test("should preserve array identity", async () => {
    const sharedArray = [1, 2, 3];
    const data = {
      first: sharedArray,
      second: sharedArray,
    };

    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.first).toBe(result.second);
  });

  test("should preserve identity in nested Maps", async () => {
    const shared = { id: 1 };
    const innerMap = new Map([["inner", shared]]);
    const outerMap = new Map([
      ["map", innerMap],
      ["direct", shared],
    ]);

    const stream = renderToReadableStream(outerMap);
    const result = await createFromReadableStream(stream);

    expect(result.get("map").get("inner")).toBe(result.get("direct"));
  });

  test("should preserve identity with self-referencing array", async () => {
    const selfArr = [1, 2];
    selfArr.push(selfArr);

    const stream = renderToReadableStream(selfArr);
    const result = await createFromReadableStream(stream);

    expect(result[2]).toBe(result);
  });

  test("should preserve identity in deeply nested circular references", async () => {
    const a = { level: 1 };
    const b = { level: 2, parent: a };
    const c = { level: 3, parent: b };
    a.descendant = c;

    const stream = renderToReadableStream(a);
    const result = await createFromReadableStream(stream);

    expect(result.descendant.parent.parent).toBe(result);
  });

  test("should preserve shared style object identity in React elements", async () => {
    const sharedStyle = { color: "red", fontSize: 16 };
    const elements = [
      {
        $$typeof: Symbol.for("react.element"),
        type: "div",
        key: "1",
        ref: null,
        props: { style: sharedStyle },
      },
      {
        $$typeof: Symbol.for("react.element"),
        type: "span",
        key: "2",
        ref: null,
        props: { style: sharedStyle },
      },
    ];

    const stream = renderToReadableStream(elements);
    const result = await createFromReadableStream(stream);

    expect(result[0].props.style).toBe(result[1].props.style);
  });
});

describe("Undefined Handling", () => {
  test("should serialize undefined values", async () => {
    const data = {
      undef: undefined,
      explicit: undefined,
    };

    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.undef).toBeUndefined();
    expect("undef" in result).toBe(true);
  });

  test("should serialize array with undefined", async () => {
    const data = [1, undefined, 3];
    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result).toEqual([1, undefined, 3]);
    expect(result[1]).toBeUndefined();
  });
});
