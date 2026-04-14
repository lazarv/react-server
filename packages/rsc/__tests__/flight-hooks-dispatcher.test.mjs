/**
 * @lazarv/rsc - Hooks Dispatcher & Render-Path Coverage
 *
 * Covers large previously-untested areas:
 *   - HooksDispatcher (useId, useMemo, useCallback, use, useMemoCache,
 *     useCacheRefresh, useDebugValue, and all unsupportedHook paths)
 *   - unsupportedContext paths (useContext, readContext)
 *   - DefaultAsyncDispatcher (getCacheForType caching, outside-of-render error)
 *   - callComponentWithDispatcher — suspense-exception retry machinery via use()
 *   - retryComponentRender — component that re-suspends across multiple use() calls
 *   - Server-side forwardRef render through the dispatcher (sync + async + error)
 *   - Context Provider / Consumer / ServerContext element serialization
 *   - Lazy element init throws thenable (resolves asynchronously) + throws error
 *   - decodeAction — $ACTION_REF_ bound action and legacy $ACTION_ID fallback
 *   - decodeFormState — $ACTION_REF_ bound action, $N bound key counting,
 *     and legacy $ACTION_ID fallback
 */

import { describe, expect, it, vi } from "vitest";

import { createFromReadableStream } from "../client/shared.mjs";
import {
  decodeAction,
  decodeFormState,
  renderToReadableStream,
} from "../server/shared.mjs";

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

const REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element");
const REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref");
const REACT_MEMO_TYPE = Symbol.for("react.memo");
const REACT_LAZY_TYPE = Symbol.for("react.lazy");
const REACT_PROVIDER_TYPE = Symbol.for("react.provider");
const REACT_CONTEXT_TYPE = Symbol.for("react.context");
const REACT_CONSUMER_TYPE = Symbol.for("react.consumer");
const REACT_SERVER_CONTEXT_TYPE = Symbol.for("react.server_context");
const REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference");

function createElement(type, props = {}, ...children) {
  const { key = null, ref = null, ...rest } = props || {};
  const finalProps = { ...rest };
  if (children.length === 1) finalProps.children = children[0];
  else if (children.length > 1) finalProps.children = children;
  return {
    $$typeof: REACT_ELEMENT_TYPE,
    type,
    key,
    ref,
    props: finalProps,
  };
}

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

/**
 * Build a minimal React-internals-like object in the shape that
 * resolveReactInternals + callComponentWithDispatcher expect. The runtime
 * writes H/A into this object on every render; reading H inside a server
 * component lets the test invoke dispatcher methods.
 */
function makeMockReact() {
  return {
    __SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: {
      H: null,
      A: null,
    },
  };
}

function getDispatcher(mockReact) {
  return mockReact.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
}

// ─────────────────────────────────────────────────────────────────────────────
// HooksDispatcher — supported hooks
// ─────────────────────────────────────────────────────────────────────────────

describe("HooksDispatcher - supported hooks", () => {
  it("useId generates deterministic ids with custom prefix and increments", async () => {
    const React = makeMockReact();
    const ids = [];

    function Comp() {
      const { H } = getDispatcher(React);
      ids.push(H.useId());
      ids.push(H.useId());
      return createElement("div", null, ids.join("|"));
    }

    const stream = renderToReadableStream(createElement(Comp), {
      react: React,
      identifierPrefix: "X",
    });
    const out = await streamToString(stream);
    expect(out).toContain("_X_0_|_X_1_");
    expect(ids).toEqual(["_X_0_", "_X_1_"]);
  });

  it("useId defaults prefix to 'S' when not set", async () => {
    const React = makeMockReact();

    function Comp() {
      const { H } = getDispatcher(React);
      return createElement("div", null, H.useId());
    }

    const stream = renderToReadableStream(createElement(Comp), {
      react: React,
    });
    const out = await streamToString(stream);
    expect(out).toMatch(/_S_0_/);
  });

  it("useMemo invokes the factory and returns its value", async () => {
    const React = makeMockReact();
    const factory = vi.fn(() => ({ ok: true, n: 42 }));

    function Comp() {
      const { H } = getDispatcher(React);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- test exercises dispatcher pass-through, not React's deps-array semantics
      const v = H.useMemo(factory, [1]);
      return createElement("div", null, String(v.n));
    }

    const stream = renderToReadableStream(createElement(Comp), {
      react: React,
    });
    const out = await streamToString(stream);
    expect(out).toContain("42");
    expect(factory).toHaveBeenCalledOnce();
  });

  it("useCallback returns the same callback identity", async () => {
    const React = makeMockReact();
    const cb = () => "hi";
    let returned;

    function Comp() {
      const { H } = getDispatcher(React);
      returned = H.useCallback(cb, []);
      return createElement("div");
    }

    await streamToString(
      renderToReadableStream(createElement(Comp), { react: React })
    );
    expect(returned).toBe(cb);
  });

  it("useDebugValue is a no-op that returns undefined", async () => {
    const React = makeMockReact();
    let result = "sentinel";

    function Comp() {
      const { H } = getDispatcher(React);
      result = H.useDebugValue("label", (v) => v);
      return createElement("div");
    }

    await streamToString(
      renderToReadableStream(createElement(Comp), { react: React })
    );
    expect(result).toBeUndefined();
  });

  it("useMemoCache returns an array of sentinels of the requested size", async () => {
    const React = makeMockReact();
    const SENTINEL = Symbol.for("react.memo_cache_sentinel");
    let cache;

    function Comp() {
      const { H } = getDispatcher(React);
      cache = H.useMemoCache(4);
      return createElement("div");
    }

    await streamToString(
      renderToReadableStream(createElement(Comp), { react: React })
    );
    expect(cache).toHaveLength(4);
    for (const slot of cache) expect(slot).toBe(SENTINEL);
  });

  it("getOwner on dispatcher returns null", async () => {
    const React = makeMockReact();
    let owner = "sentinel";

    function Comp() {
      const { H } = getDispatcher(React);
      owner = H.getOwner();
      return createElement("div");
    }

    await streamToString(
      renderToReadableStream(createElement(Comp), { react: React })
    );
    expect(owner).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HooksDispatcher — unsupported hooks and contexts
// ─────────────────────────────────────────────────────────────────────────────

describe("HooksDispatcher - unsupported hooks", () => {
  // Each of these should throw "not supported in Server Components"
  const HOOK_NAMES = [
    "useEffect",
    "useImperativeHandle",
    "useLayoutEffect",
    "useInsertionEffect",
    "useReducer",
    "useRef",
    "useState",
    "useDeferredValue",
    "useTransition",
    "useSyncExternalStore",
    "useHostTransitionStatus",
    "useFormState",
    "useActionState",
    "useOptimistic",
    "useCacheRefresh",
  ];

  for (const hookName of HOOK_NAMES) {
    it(`${hookName} throws "not supported" when called`, async () => {
      const React = makeMockReact();
      let caught;

      function Comp() {
        const { H } = getDispatcher(React);
        try {
          H[hookName]();
        } catch (error) {
          caught = error;
        }
        return createElement("div");
      }

      await streamToString(
        renderToReadableStream(createElement(Comp), { react: React })
      );
      expect(caught).toBeInstanceOf(Error);
      expect(caught.message).toMatch(/not supported in Server Components/);
    });
  }

  it("useContext throws 'Cannot read context'", async () => {
    const React = makeMockReact();
    let caught;

    function Comp() {
      const { H } = getDispatcher(React);
      try {
        H.useContext({ $$typeof: REACT_CONTEXT_TYPE });
      } catch (error) {
        caught = error;
      }
      return createElement("div");
    }

    await streamToString(
      renderToReadableStream(createElement(Comp), { react: React })
    );
    expect(caught.message).toMatch(/Cannot read context/);
  });

  it("readContext throws 'Cannot read context'", async () => {
    const React = makeMockReact();
    let caught;

    function Comp() {
      const { H } = getDispatcher(React);
      try {
        H.readContext({ $$typeof: REACT_CONTEXT_TYPE });
      } catch (error) {
        caught = error;
      }
      return createElement("div");
    }

    await streamToString(
      renderToReadableStream(createElement(Comp), { react: React })
    );
    expect(caught.message).toMatch(/Cannot read context/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HooksDispatcher — use()
// ─────────────────────────────────────────────────────────────────────────────

describe("HooksDispatcher - use()", () => {
  it("rejects use() of a context from a Server Component", async () => {
    const React = makeMockReact();
    let caught;

    function Comp() {
      const { H } = getDispatcher(React);
      try {
        H.use({ $$typeof: REACT_CONTEXT_TYPE });
      } catch (error) {
        caught = error;
      }
      return createElement("div");
    }

    await streamToString(
      renderToReadableStream(createElement(Comp), { react: React })
    );
    expect(caught.message).toMatch(/Cannot read context/);
  });

  it("rejects use() of a resolved Client Reference", async () => {
    const React = makeMockReact();
    let caught;

    function Comp() {
      const { H } = getDispatcher(React);
      try {
        H.use({ $$typeof: REACT_CLIENT_REFERENCE, value: null });
      } catch (error) {
        caught = error;
      }
      return createElement("div");
    }

    await streamToString(
      renderToReadableStream(createElement(Comp), { react: React })
    );
    expect(caught.message).toMatch(/already resolved Client Reference/);
  });

  it("rejects use() of a Client Context from a Server Component", async () => {
    const React = makeMockReact();
    let caught;

    function Comp() {
      const { H } = getDispatcher(React);
      try {
        H.use({
          $$typeof: REACT_CLIENT_REFERENCE,
          value: { $$typeof: REACT_CONTEXT_TYPE },
        });
      } catch (error) {
        caught = error;
      }
      return createElement("div");
    }

    await streamToString(
      renderToReadableStream(createElement(Comp), { react: React })
    );
    expect(caught.message).toMatch(/Client Context from a Server Component/);
  });

  it("rejects use() of an unsupported value (number)", async () => {
    const React = makeMockReact();
    let caught;

    function Comp() {
      const { H } = getDispatcher(React);
      try {
        H.use(42);
      } catch (error) {
        caught = error;
      }
      return createElement("div");
    }

    await streamToString(
      renderToReadableStream(createElement(Comp), { react: React })
    );
    expect(caught.message).toMatch(/unsupported type was passed to use/);
  });

  it("use() on an already-fulfilled thenable returns its value synchronously", async () => {
    const React = makeMockReact();
    let observed;

    // Thenable that already reports fulfilled state — matches React's
    // "reuse resolved value" fast path in trackUsedThenable.
    const resolved = Promise.resolve("READY");
    resolved.status = "fulfilled";
    resolved.value = "READY";

    function Comp() {
      const { H } = getDispatcher(React);
      observed = H.use(resolved);
      return createElement("div", null, observed);
    }

    const out = await streamToString(
      renderToReadableStream(createElement(Comp), { react: React })
    );
    expect(observed).toBe("READY");
    expect(out).toContain("READY");
  });

  it("use() on an already-rejected thenable throws that reason synchronously", async () => {
    const React = makeMockReact();
    let caught;
    const err = new Error("already-rejected");
    const rejected = Promise.resolve().then(() => {
      // avoid actual unhandled rejection — we set status manually below
    });
    rejected.status = "rejected";
    rejected.reason = err;

    function Comp() {
      const { H } = getDispatcher(React);
      try {
        H.use(rejected);
      } catch (error) {
        caught = error;
      }
      return createElement("div");
    }

    await streamToString(
      renderToReadableStream(createElement(Comp), { react: React })
    );
    expect(caught).toBe(err);
  });

  it("use() on a pending thenable suspends and retries once it resolves", async () => {
    const React = makeMockReact();
    let callCount = 0;
    let resolveThenable;
    const pending = new Promise((r) => {
      resolveThenable = r;
    });

    function Comp() {
      const { H } = getDispatcher(React);
      callCount++;
      // First call: pending — use() throws SuspenseException which causes
      // callComponentWithDispatcher to catch and rethrow the tracked thenable.
      // retryComponentRender then awaits it and re-invokes the component.
      const value = H.use(pending);
      return createElement("div", null, `got:${value}`);
    }

    const streamPromise = streamToString(
      renderToReadableStream(createElement(Comp), { react: React })
    );

    // Give the first render tick a chance to suspend, then resolve.
    await Promise.resolve();
    resolveThenable("DELAYED");

    const out = await streamPromise;
    expect(out).toContain("got:DELAYED");
    // First attempt suspended, second attempt succeeded.
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  it("component that re-suspends across multiple use() calls eventually completes", async () => {
    const React = makeMockReact();
    let resolveA;
    let resolveB;
    const a = new Promise((r) => (resolveA = r));
    const b = new Promise((r) => (resolveB = r));
    let tries = 0;

    function Comp() {
      const { H } = getDispatcher(React);
      tries++;
      const x = H.use(a);
      const y = H.use(b);
      return createElement("div", null, `${x}-${y}`);
    }

    const streamPromise = streamToString(
      renderToReadableStream(createElement(Comp), { react: React })
    );

    // Let initial render suspend on `a`, then resolve — triggers retry,
    // which suspends on `b`, then resolve — triggers second retry.
    await Promise.resolve();
    resolveA("A");
    await Promise.resolve();
    await Promise.resolve();
    resolveB("B");

    const out = await streamPromise;
    expect(out).toContain("A-B");
    // At least 3 render attempts (1 initial + 2 retries).
    expect(tries).toBeGreaterThanOrEqual(3);
  });

  it("retry that throws a non-thenable rejects the promise with that error", async () => {
    const React = makeMockReact();
    let resolveGate;
    const gate = new Promise((r) => (resolveGate = r));
    let pass = 0;

    function Comp() {
      const { H } = getDispatcher(React);
      pass++;
      if (pass === 1) {
        // First pass: suspend.
        H.use(gate);
      }
      // Second pass: throw a real error.
      throw new Error("retry-boom");
    }

    const onError = vi.fn();
    const stream = renderToReadableStream(createElement(Comp), {
      react: React,
      onError,
    });

    await Promise.resolve();
    resolveGate("go");

    const out = await streamToString(stream);
    // Error was surfaced via emitErrorRow → an E row lands on the stream.
    expect(out).toContain(":E");
    expect(out).toContain("retry-boom");
    expect(onError).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DefaultAsyncDispatcher
// ─────────────────────────────────────────────────────────────────────────────

describe("DefaultAsyncDispatcher - getCacheForType", () => {
  it("caches resource by type identity across calls in one render", async () => {
    const React = makeMockReact();
    const created = [];
    const resourceType = () => {
      const obj = { tag: "r" };
      created.push(obj);
      return obj;
    };

    let first;
    let second;

    function Comp() {
      const { A } = getDispatcher(React);
      first = A.getCacheForType(resourceType);
      second = A.getCacheForType(resourceType);
      return createElement("div");
    }

    await streamToString(
      renderToReadableStream(createElement(Comp), { react: React })
    );

    expect(first).toBe(second);
    // resourceType factory only invoked once despite two lookups.
    expect(created).toHaveLength(1);
  });

  it("getOwner on async dispatcher returns null", async () => {
    const React = makeMockReact();
    let owner = "sentinel";
    function Comp() {
      const { A } = getDispatcher(React);
      owner = A.getOwner();
      return createElement("div");
    }
    await streamToString(
      renderToReadableStream(createElement(Comp), { react: React })
    );
    expect(owner).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Server components without a react option
// ─────────────────────────────────────────────────────────────────────────────

describe("callComponentWithDispatcher - no react internals", () => {
  it("hookless server components still render when `react` option is omitted", async () => {
    function Comp() {
      // No hooks — should render directly without setting a dispatcher.
      return createElement("div", null, "plain");
    }

    const out = await streamToString(
      renderToReadableStream(createElement(Comp))
    );
    expect(out).toContain("plain");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Server forwardRef — render function invoked through dispatcher
// ─────────────────────────────────────────────────────────────────────────────

describe("Server-side forwardRef rendering", () => {
  it("invokes render(props, ref) through the dispatcher and serializes result", async () => {
    const React = makeMockReact();
    const refSeen = { current: "from-ref" };
    let renderPropsSeen;
    let renderRefSeen;

    const fwd = {
      $$typeof: REACT_FORWARD_REF_TYPE,
      render: function NamedForward(props, ref) {
        renderPropsSeen = props;
        renderRefSeen = ref;
        // Call a hook so we prove the dispatcher was active during render.
        const { H } = getDispatcher(React);
        const id = H.useId();
        return createElement("div", { "data-id": id }, props.text);
      },
    };

    const element = {
      $$typeof: REACT_ELEMENT_TYPE,
      type: fwd,
      key: null,
      ref: refSeen,
      props: { text: "hello-fwd" },
    };

    const out = await streamToString(
      renderToReadableStream(element, { react: React })
    );

    expect(renderPropsSeen).toEqual({ text: "hello-fwd" });
    expect(renderRefSeen).toBe(refSeen);
    expect(out).toContain("hello-fwd");
    expect(out).toMatch(/_S_0_/);
  });

  it("unwraps memo(forwardRef(...)) and renders through the dispatcher", async () => {
    const React = makeMockReact();

    const inner = {
      $$typeof: REACT_FORWARD_REF_TYPE,
      render: function InnerForward(props) {
        return createElement("span", null, `wrapped:${props.n}`);
      },
    };
    const memoized = {
      $$typeof: REACT_MEMO_TYPE,
      type: inner,
      compare: null,
    };

    const element = {
      $$typeof: REACT_ELEMENT_TYPE,
      type: memoized,
      key: null,
      ref: null,
      props: { n: 7 },
    };

    const out = await streamToString(
      renderToReadableStream(element, { react: React })
    );
    expect(out).toContain("wrapped:7");
  });

  it("forwardRef render that throws a non-thenable error surfaces an error row", async () => {
    const React = makeMockReact();
    const fwd = {
      $$typeof: REACT_FORWARD_REF_TYPE,
      render: function Boom() {
        throw new Error("forward-boom");
      },
    };
    const element = {
      $$typeof: REACT_ELEMENT_TYPE,
      type: fwd,
      key: null,
      ref: null,
      props: {},
    };

    const onError = vi.fn();
    const out = await streamToString(
      renderToReadableStream(element, { react: React, onError })
    );
    expect(out).toContain("forward-boom");
    expect(onError).toHaveBeenCalled();
  });

  it("forwardRef render that returns a thenable serializes as a pending promise", async () => {
    const React = makeMockReact();
    const fwd = {
      $$typeof: REACT_FORWARD_REF_TYPE,
      render: async function AsyncForward(props) {
        return createElement("span", null, `async:${props.v}`);
      },
    };
    const element = {
      $$typeof: REACT_ELEMENT_TYPE,
      type: fwd,
      key: null,
      ref: null,
      props: { v: "z" },
    };

    const out = await streamToString(
      renderToReadableStream(element, { react: React })
    );
    expect(out).toContain("async:z");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Context types
// ─────────────────────────────────────────────────────────────────────────────

describe("Context element serialization", () => {
  it("Provider renders children transparently", async () => {
    const provider = {
      $$typeof: REACT_PROVIDER_TYPE,
      _context: { _currentValue: "ctx-val" },
    };
    const element = {
      $$typeof: REACT_ELEMENT_TYPE,
      type: provider,
      key: null,
      ref: null,
      props: { value: "ctx-val", children: "inside-provider" },
    };
    const out = await streamToString(renderToReadableStream(element));
    expect(out).toContain("inside-provider");
  });

  it("Consumer (legacy) calls function children with undefined", async () => {
    const consumer = { $$typeof: REACT_CONTEXT_TYPE };
    const element = {
      $$typeof: REACT_ELEMENT_TYPE,
      type: consumer,
      key: null,
      ref: null,
      props: {
        children: (value) => `legacy-consumer:${String(value)}`,
      },
    };
    const out = await streamToString(renderToReadableStream(element));
    expect(out).toContain("legacy-consumer:undefined");
  });

  it("Consumer (legacy) with non-function children renders children", async () => {
    const consumer = { $$typeof: REACT_CONTEXT_TYPE };
    const element = {
      $$typeof: REACT_ELEMENT_TYPE,
      type: consumer,
      key: null,
      ref: null,
      props: { children: "plain-child" },
    };
    const out = await streamToString(renderToReadableStream(element));
    expect(out).toContain("plain-child");
  });

  it("Consumer (new-style) calls function children with context._currentValue", async () => {
    const consumer = {
      $$typeof: REACT_CONSUMER_TYPE,
      _context: { _currentValue: "default-new" },
    };
    const element = {
      $$typeof: REACT_ELEMENT_TYPE,
      type: consumer,
      key: null,
      ref: null,
      props: {
        children: (value) => `new-consumer:${value}`,
      },
    };
    const out = await streamToString(renderToReadableStream(element));
    expect(out).toContain("new-consumer:default-new");
  });

  it("Consumer (new-style) with non-function children renders children", async () => {
    const consumer = { $$typeof: REACT_CONSUMER_TYPE };
    const element = {
      $$typeof: REACT_ELEMENT_TYPE,
      type: consumer,
      key: null,
      ref: null,
      props: { children: "new-plain" },
    };
    const out = await streamToString(renderToReadableStream(element));
    expect(out).toContain("new-plain");
  });

  it("ServerContext provider renders children", async () => {
    const serverContext = { $$typeof: REACT_SERVER_CONTEXT_TYPE };
    const element = {
      $$typeof: REACT_ELEMENT_TYPE,
      type: serverContext,
      key: null,
      ref: null,
      props: { children: "server-context-child" },
    };
    const out = await streamToString(renderToReadableStream(element));
    expect(out).toContain("server-context-child");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lazy element init behavior
// ─────────────────────────────────────────────────────────────────────────────

describe("Lazy element init paths", () => {
  it("when init() throws a thenable, the element resolves asynchronously once it fulfills with the component", async () => {
    let resolveInit;
    const gate = new Promise((r) => (resolveInit = r));

    // The serializer's lazy fallback (see serializeElement line ~2015) uses
    // the thenable's resolution value AS the component — `error.then(resolved
    // => serializeElement({...element, type: resolved}))`. So gate must
    // resolve to the component function itself, not be a "signal to retry".
    const LazyResolved = function LazyResolved(props) {
      return createElement("div", null, `lazy:${props.n}`);
    };

    const lazy = {
      $$typeof: REACT_LAZY_TYPE,
      _payload: null,
      _init() {
        throw gate;
      },
    };

    const element = {
      $$typeof: REACT_ELEMENT_TYPE,
      type: lazy,
      key: null,
      ref: null,
      props: { n: 3 },
    };

    const streamPromise = streamToString(renderToReadableStream(element));
    // Let the renderer emit the pending promise reference, then fulfill gate
    // with the component function.
    await Promise.resolve();
    resolveInit(LazyResolved);

    const out = await streamPromise;
    expect(out).toContain("lazy:3");
  });

  it("when init() throws a non-thenable error, serialization errors", async () => {
    const lazy = {
      $$typeof: REACT_LAZY_TYPE,
      _payload: null,
      _init() {
        throw new Error("lazy-load-boom");
      },
    };
    const element = {
      $$typeof: REACT_ELEMENT_TYPE,
      type: lazy,
      key: null,
      ref: null,
      props: {},
    };

    const onError = vi.fn();
    const out = await streamToString(
      renderToReadableStream(element, { onError })
    );
    // The error bubbles up through serialization; the stream emits an E row.
    expect(out).toContain("lazy-load-boom");
    expect(onError).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// decodeAction — bound action reference paths
// ─────────────────────────────────────────────────────────────────────────────

describe("decodeAction - $ACTION_REF_ bound actions", () => {
  it("loads a bound action from $ACTION_REF_ metadata with inline id", async () => {
    const form = new FormData();
    // Prefix: $ACTION_ stays attached; the "REF_" becomes the suffix under
    // which bound metadata is stored (see the source comment on 2719-2722).
    form.append("$ACTION_REF_0", ""); // marker for prefix "0"
    form.append("$ACTION_0:0", JSON.stringify({ id: "MODULE#action" }));

    const loader = vi.fn(async (id) => {
      if (id === "MODULE#action") {
        return async function act() {
          return "ok";
        };
      }
      return null;
    });

    const result = await decodeAction(form, {
      moduleLoader: { loadServerAction: loader },
    });
    expect(typeof result).toBe("function");
    expect(loader).toHaveBeenCalledWith("MODULE#action");
  });

  it("loads a bound action when metadata is a $h-prefixed reference", async () => {
    const form = new FormData();
    form.append("$ACTION_REF_0", "");
    // Metadata points at another numeric part that holds {id}
    form.append("$ACTION_0:0", JSON.stringify("$h1"));
    form.append("$ACTION_0:1", JSON.stringify({ id: "MOD#ref-action" }));

    const loader = vi.fn(async (id) => {
      if (id === "MOD#ref-action") {
        return async function act() {
          return "ok";
        };
      }
      return null;
    });

    const result = await decodeAction(form, {
      moduleLoader: { loadServerAction: loader },
    });
    expect(typeof result).toBe("function");
    expect(loader).toHaveBeenCalledWith("MOD#ref-action");
  });

  it("returns null when no action id can be found", async () => {
    const form = new FormData();
    form.append("something-else", "x");
    const result = await decodeAction(form, {
      moduleLoader: { loadServerAction: async () => null },
    });
    expect(result).toBeNull();
  });

  it("returns null for non-FormData input", async () => {
    expect(await decodeAction("not-form-data")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// decodeFormState — counting and id resolution
// ─────────────────────────────────────────────────────────────────────────────

describe("decodeFormState", () => {
  it("returns null for non-FormData body", () => {
    expect(decodeFormState("result", "not-form-data")).toBeNull();
  });

  it("returns null when no action id is present", () => {
    const form = new FormData();
    form.append("data", "x");
    expect(decodeFormState("result", form)).toBeNull();
  });

  it("extracts action id from legacy $ACTION_ID field value", () => {
    const form = new FormData();
    form.append("$ACTION_ID", "legacy-action");
    form.append("$ACTION_KEY", "my-key");

    const state = decodeFormState("payload", form);
    expect(state).toEqual(["payload", "my-key", "legacy-action", 0]);
  });

  it("counts $N bound arg fields", () => {
    const form = new FormData();
    form.append("$ACTION_ID_unbound", "");
    form.append("$0", "bound0");
    form.append("$1", "bound1");
    form.append("$2", "bound2");

    const state = decodeFormState("v", form);
    expect(state[2]).toBe("unbound");
    expect(state[3]).toBe(3);
  });

  it("extracts id and counts bound args from $ACTION_REF_ metadata", () => {
    const form = new FormData();
    form.append("$ACTION_REF_p", "");
    form.append("$ACTION_p:0", JSON.stringify({ id: "REF#bound" }));
    form.append("$ACTION_p:1", "arg-one");
    form.append("$ACTION_p:2", "arg-two");

    const state = decodeFormState("r", form);
    expect(state[2]).toBe("REF#bound");
    // Count only numeric-suffixed keys under the prefix (:0, :1, :2 → 3)
    expect(state[3]).toBe(3);
  });

  it("tolerates invalid JSON in $ACTION_REF_ metadata and falls back", () => {
    const form = new FormData();
    form.append("$ACTION_REF_p", "");
    form.append("$ACTION_p:0", "not-json-{");
    // Fall-through: no id extracted from metadata, no legacy $ACTION_ID,
    // so the function returns null.
    expect(decodeFormState("x", form)).toBeNull();
  });

  it("defaults keyPath to empty string when $ACTION_KEY is missing", () => {
    const form = new FormData();
    form.append("$ACTION_ID_abc", "");
    const state = decodeFormState("v", form);
    expect(state).toEqual(["v", "", "abc", 0]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Round-trip sanity check — hooks dispatcher output is a valid RSC stream
// ─────────────────────────────────────────────────────────────────────────────

describe("Hooks dispatcher - end-to-end round trip", () => {
  it("renders a component that uses useId and useMemo and deserializes cleanly", async () => {
    const React = makeMockReact();

    function Greeter({ name }) {
      const { H } = getDispatcher(React);
      const id = H.useId();
      const label = H.useMemo(() => `hello, ${name}!`, [name]);
      return createElement("p", { id }, label);
    }

    const stream = renderToReadableStream(
      createElement(Greeter, { name: "x" }),
      {
        react: React,
      }
    );
    const result = await createFromReadableStream(stream);

    expect(result.type).toBe("p");
    expect(result.props.id).toMatch(/_S_0_/);
    expect(result.props.children).toBe("hello, x!");
  });
});
