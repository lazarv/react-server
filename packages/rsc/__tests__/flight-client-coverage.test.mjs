/**
 * @lazarv/rsc - Client-side coverage gap tests
 *
 * Targets uncovered paths in packages/rsc/client/shared.mjs:
 *   - resolveModuleReference: sync-throw, async fulfilled-fast-path, async-rejected
 *   - processHint: chunks→preloadModule, code→onHint
 *   - processConsoleReplay: deserializeValue-throws branch
 *   - Inline $L<moduleId>#<exportName> client reference (with & without moduleLoader)
 *   - $h server reference: bound as Promise ($@), chunk not yet resolved
 *   - Path refs on null segments ($N:missing:key)
 *   - createLazyWrapper: fulfilled-Promise fast path, rejected chunk, pending chunk
 *   - createServerAction: $$FORM_ACTION (bound & unbound), $$IS_SIGNATURE_EQUAL, .bind()
 *   - continueBinaryRow split across chunks
 *   - processBinaryData: new-chunk creation path
 *   - createServerReference public API: .bind() chain
 *   - appendFilesToFormData: recurse into $$bound
 *   - ReadableStream wrapper cancel()
 *   - $Y typed array via typeRegistry custom constructor
 */

import { describe, expect, it, vi } from "vitest";

import {
  createFromReadableStream,
  createServerReference,
  encodeReply,
  syncFromBuffer,
} from "../client/shared.mjs";

const REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference");
const REACT_SERVER_REFERENCE = Symbol.for("react.server.reference");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Wrap a string payload in a ReadableStream of Uint8Array chunks. */
function streamOf(...chunks) {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(ctrl) {
      for (const c of chunks) {
        ctrl.enqueue(typeof c === "string" ? enc.encode(c) : c);
      }
      ctrl.close();
    },
  });
}

/** Build a ReadableStream from pre-encoded byte arrays (for binary tests). */
function byteStream(...parts) {
  return new ReadableStream({
    start(ctrl) {
      for (const p of parts) ctrl.enqueue(p);
      ctrl.close();
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// resolveModuleReference branches
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveModuleReference", () => {
  it("rejects the chunk when requireModule throws synchronously", async () => {
    // I row resolves chunk 1.  Model row references it via $L1.
    // requireModule throws → rejectChunk(1, err).  $L1 then wraps the
    // REJECTED chunk in a lazy wrapper; _init on the wrapper throws.
    const payload = '1:I{"id":"m","chunks":[],"name":"default"}\n0:"$L1"\n';
    const moduleLoader = {
      requireModule() {
        throw new Error("missing-module-sync");
      },
    };
    const lazy = await createFromReadableStream(streamOf(payload), {
      moduleLoader,
    });
    expect(lazy.$$typeof).toBe(Symbol.for("react.lazy"));
    expect(() => lazy._init(lazy._payload)).toThrow(/missing-module-sync/);
  });

  it("resolves the chunk synchronously when requireModule returns an already-fulfilled Promise", async () => {
    // Status-annotated Promise (React's webpack fast-path protocol).
    const resolved = Promise.resolve({ default: "export-value" });
    resolved.status = "fulfilled";
    resolved.value = { default: "export-value" };

    const moduleLoader = {
      requireModule: () => resolved,
    };

    const payload = '1:I{"id":"m","chunks":[],"name":"default"}\n0:"$L1"\n';
    const root = await createFromReadableStream(streamOf(payload), {
      moduleLoader,
    });
    expect(root).toBe("export-value");
  });

  it("rejects the chunk when async requireModule rejects", async () => {
    const moduleLoader = {
      requireModule: () => {
        const p = Promise.reject(new Error("import-failed"));
        p.catch(() => {}); // suppress unhandled
        return p;
      },
    };
    const payload = '1:I{"id":"m","chunks":[],"name":"default"}\n0:"$L1"\n';
    const lazy = await createFromReadableStream(streamOf(payload), {
      moduleLoader,
    });
    // $L1 falls through to createLazyWrapper for REJECTED chunk; _init throws.
    expect(lazy.$$typeof).toBe(Symbol.for("react.lazy"));
    expect(() => lazy._init(lazy._payload)).toThrow(/import-failed/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// processHint
// ─────────────────────────────────────────────────────────────────────────────

describe("processHint", () => {
  it("calls moduleLoader.preloadModule for each chunk in the hint", async () => {
    const preloadModule = vi.fn();
    // H rows require a non-empty id (global rows with empty idPart are ignored
    // except for "N" timestamps).  Use id=1 for the hint, then resolve root.
    const payload = '1:H{"chunks":["a.js","b.js"]}\n0:1\n';
    await createFromReadableStream(streamOf(payload), {
      moduleLoader: { preloadModule },
    });
    expect(preloadModule).toHaveBeenCalledTimes(2);
    expect(preloadModule).toHaveBeenNthCalledWith(1, { chunks: ["a.js"] });
    expect(preloadModule).toHaveBeenNthCalledWith(2, { chunks: ["b.js"] });
  });

  it("calls onHint with code and model when hint has a code", async () => {
    const onHint = vi.fn();
    const payload = '1:H{"code":"S","model":{"href":"/x.css"}}\n0:1\n';
    await createFromReadableStream(streamOf(payload), { onHint });
    expect(onHint).toHaveBeenCalledWith("S", { href: "/x.css" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// processConsoleReplay
// ─────────────────────────────────────────────────────────────────────────────

describe("processConsoleReplay", () => {
  it("replays the console call with the supplied env prefix", async () => {
    // W rows are only processed when they carry an id (global :W rows are
    // ignored at processLine's global-row branch).  Use 1:W... to reach
    // processConsoleReplay.
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const payload =
        '1:W{"method":"log","args":["hello"],"env":"Server"}\n0:1\n';
      await createFromReadableStream(streamOf(payload));
      expect(logSpy).toHaveBeenCalled();
      const call = logSpy.mock.calls[0];
      expect(call[0]).toBe("[Server]");
      expect(call[1]).toBe("hello");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("uses [Server] prefix when env is missing", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const payload = '1:W{"method":"log","args":["x"]}\n0:1\n';
      await createFromReadableStream(streamOf(payload));
      expect(logSpy.mock.calls[0][0]).toBe("[Server]");
    } finally {
      logSpy.mockRestore();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Inline $L<moduleId>#<exportName> format
// ─────────────────────────────────────────────────────────────────────────────

describe("inline $L client references", () => {
  it("creates a lazy wrapper via moduleLoader when the $L body contains '#'", async () => {
    const preloadModule = vi.fn();
    const requireModule = vi.fn((metadata) => ({
      [metadata.name]: function MyExport() {
        return "rendered";
      },
    }));
    const payload = '0:"$Lpath/to/mod#MyExport"\n';
    const root = await createFromReadableStream(streamOf(payload), {
      moduleLoader: { preloadModule, requireModule },
    });
    // preload is called from the inline-$L branch
    expect(preloadModule).toHaveBeenCalledWith({
      id: "path/to/mod",
      name: "MyExport",
      chunks: [],
    });
    // The deserialized value is a lazy wrapper — exposes $$typeof/_init/_payload
    expect(root).toBeDefined();
    expect(root.$$typeof).toBe(Symbol.for("react.lazy"));
    expect(typeof root._init).toBe("function");
    // Invoking _init loads the module synchronously via requireModule
    const resolved = root._init(root._payload);
    expect(typeof resolved).toBe("function");
    expect(resolved.name).toBe("MyExport");
  });

  it("returns a placeholder client reference when no moduleLoader is supplied", async () => {
    const payload = '0:"$Lpath/to/mod#Bare"\n';
    const root = await createFromReadableStream(streamOf(payload));
    expect(root).toEqual({
      $$typeof: REACT_CLIENT_REFERENCE,
      $$id: "path/to/mod#Bare",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// $h server reference — bound as Promise, chunk not yet resolved
// ─────────────────────────────────────────────────────────────────────────────

describe("$h server reference branches", () => {
  it("wraps the action in an async bound-unwrapper when bound is a $@ Promise", async () => {
    const callServer = vi.fn(async (id, args) => ({ id, args }));
    // chunk 2 → array [10, 20] ; chunk 1 → {id, bound: $@2} ; root → $h1
    const payload = '2:[10,20]\n1:{"id":"act","bound":"$@2"}\n0:"$h1"\n';
    const action = await createFromReadableStream(streamOf(payload), {
      callServer,
    });
    expect(action.$$typeof).toBe(REACT_SERVER_REFERENCE);
    expect(action.$$id).toBe("act");
    // $$bound is the original promise (preserved for introspection)
    expect(typeof action.$$bound.then).toBe("function");
    // Calling the action resolves the bound promise and prepends to args
    const result = await action("extra");
    expect(callServer).toHaveBeenCalledWith("act", [10, 20, "extra"]);
    expect(result).toEqual({ id: "act", args: [10, 20, "extra"] });
  });

  it("creates an unbound server action when $h model has no bound array", async () => {
    const callServer = vi.fn(async (id, args) => ({ id, args }));
    const payload = '1:{"id":"plain"}\n0:"$h1"\n';
    const action = await createFromReadableStream(streamOf(payload), {
      callServer,
    });
    expect(action.$$id).toBe("plain");
    expect(action.$$bound).toBeNull();
    await action("a", "b");
    expect(callServer).toHaveBeenCalledWith("plain", ["a", "b"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Path reference — resolvePath on null segment
// ─────────────────────────────────────────────────────────────────────────────

describe("resolvePath edge cases", () => {
  it("returns undefined when a path traverses through a null value", async () => {
    // chunk 1 has {a: null}; root is {x: "$1:a:deep"} which should resolve to undefined
    const payload = '1:{"a":null}\n0:{"x":"$1:a:deep"}\n';
    const root = await createFromReadableStream(streamOf(payload));
    expect(root).toEqual({ x: undefined });
  });

  it("follows a multi-segment path successfully", async () => {
    const payload = '1:{"a":{"b":{"c":"found"}}}\n0:{"x":"$1:a:b:c"}\n';
    const root = await createFromReadableStream(streamOf(payload));
    expect(root.x).toBe("found");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createLazyWrapper — module-loading paths
// ─────────────────────────────────────────────────────────────────────────────

describe("createLazyWrapper", () => {
  // These tests go via syncFromBuffer to get a lazy wrapper that wraps a
  // client-reference descriptor (no-loader context — see resolveModuleReference
  // lines 1082-1090).  Calling _init on that wrapper with a module loader
  // attached to the reference exercises the client-ref module-loading branch.

  function makeWrappedChunk(requireModule) {
    // Build a lazy wrapper by deserializing a payload that produces a
    // client-reference descriptor inside a lazy wrapper.  The RESOLVED chunk
    // value is a REACT_CLIENT_REFERENCE with $$loader — which is the exact
    // shape that the createLazyWrapper's client-ref branch expects.
    const payload = '1:I{"id":"m","chunks":[],"name":"default"}\n0:"$L1"\n';
    // No moduleLoader → resolveModuleReference resolves chunk 1 with a client
    // reference descriptor.  The $L1 then wraps it in a lazy wrapper because
    // the resolved value has $$typeof === REACT_CLIENT_REFERENCE.
    const root = syncFromBuffer(new TextEncoder().encode(payload));
    // Inject a loader onto the client reference descriptor
    root._payload.value.$$loader = { requireModule };
    return root;
  }

  it("unwraps synchronously when the module import Promise is already fulfilled", () => {
    const resolved = Promise.resolve({ default: "sync-unwrap" });
    resolved.status = "fulfilled";
    resolved.value = { default: "sync-unwrap" };
    const lazy = makeWrappedChunk(() => resolved);
    const result = lazy._init(lazy._payload);
    expect(result).toBe("sync-unwrap");
    // Second call uses the cached _moduleStatus === "fulfilled" fast path
    expect(lazy._init(lazy._payload)).toBe("sync-unwrap");
  });

  it("throws the cached module promise for Suspense when import is pending", () => {
    let resolveImport;
    const importPromise = new Promise((r) => {
      resolveImport = r;
    });
    // Don't annotate status — createLazyWrapper installs the .then handler
    const lazy = makeWrappedChunk(() => importPromise);
    // First call: loader returns the raw promise, wrapper throws it.
    // The thrown value is a Promise (not an Error), so use explicit try/catch
    // rather than expect(...).toThrow() which has version-dependent semantics
    // for non-Error throws.
    let thrown1;
    try {
      lazy._init(lazy._payload);
    } catch (e) {
      thrown1 = e;
    }
    expect(thrown1).toBeDefined();
    expect(typeof thrown1.then).toBe("function");
    // Second call: cached _modulePromise is still unresolved → rethrows the
    // same promise reference.
    let thrown2;
    try {
      lazy._init(lazy._payload);
    } catch (e) {
      thrown2 = e;
    }
    expect(thrown2).toBe(thrown1);
    resolveImport({ default: "eventually" });
  });

  it("unwraps synchronously on the module-value fast path", () => {
    // Returning a non-thenable synchronously exercises the "Sync module loading"
    // branch at the end of the client-ref block.
    const lazy = makeWrappedChunk(() => ({ default: "plain-sync" }));
    expect(lazy._init(lazy._payload)).toBe("plain-sync");
  });

  it("returns the module directly when requireModule returns a non-object", () => {
    const lazy = makeWrappedChunk(() => "scalar-module");
    expect(lazy._init(lazy._payload)).toBe("scalar-module");
  });

  it("throws the rejected error on second call after an async failure", async () => {
    const failure = new Error("async-load-fail");
    const rejected = Promise.reject(failure);
    // Attach a catch to prevent unhandled-rejection before we consume
    rejected.catch(() => {});
    const lazy = makeWrappedChunk(() => rejected);
    // First call throws the pending promise
    let caught;
    try {
      lazy._init(lazy._payload);
    } catch (e) {
      caught = e;
    }
    // Await the promise to let it settle
    try {
      await caught;
    } catch {
      /* expected */
    }
    // Next call hits the _moduleStatus === "rejected" fast path
    expect(() => lazy._init(lazy._payload)).toThrow(/async-load-fail/);
  });

  it("as a callable, invokes the resolved function with forwarded arguments", () => {
    const fn = (...args) => ["called", ...args];
    const lazy = makeWrappedChunk(() => ({ default: fn }));
    expect(lazy("a", "b")).toEqual(["called", "a", "b"]);
  });

  it("as a callable, returns the resolved value when it's not a function", () => {
    const lazy = makeWrappedChunk(() => ({ default: 42 }));
    expect(lazy()).toBe(42);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createServerAction — $$FORM_ACTION / $$IS_SIGNATURE_EQUAL / .bind()
// ─────────────────────────────────────────────────────────────────────────────

describe("createServerAction form action helpers", () => {
  async function loadAction(payload, opts = {}) {
    return createFromReadableStream(streamOf(payload), {
      callServer: () => Promise.resolve(),
      ...opts,
    });
  }

  it("emits a $ACTION_REF_<prefix> form action when bound args exist", async () => {
    // bound = inline array → createServerAction(id, bound) with boundArgs.length > 0
    const payload =
      '1:{"id":"bound-id","bound":[1,"s",true,{"x":1}]}\n0:"$h1"\n';
    const action = await loadAction(payload);
    const formAction = action.$$FORM_ACTION("P0");
    expect(formAction.name).toBe("$ACTION_REF_P0");
    expect(formAction.method).toBe("POST");
    expect(formAction.data).toBeInstanceOf(FormData);
    const payloadStr = formAction.data.get("$ACTION_P0:0");
    const parsed = JSON.parse(payloadStr);
    // Number/bool serialized raw; objects as JSON strings; strings as-is
    expect(parsed[0]).toBe(1);
    expect(parsed[1]).toBe("s");
    expect(parsed[2]).toBe(true);
    expect(parsed[3]).toBe('{"x":1}');
  });

  it("emits a $ACTION_ID_<id> form action when unbound", async () => {
    const payload = '1:{"id":"plain-id"}\n0:"$h1"\n';
    const action = await loadAction(payload);
    const formAction = action.$$FORM_ACTION("P1");
    expect(formAction.name).toBe("$ACTION_ID_plain-id");
    expect(formAction.data).toBeNull();
  });

  it("$$IS_SIGNATURE_EQUAL matches id + bound-arg count", async () => {
    const payload = '1:{"id":"sig","bound":[1,2]}\n0:"$h1"\n';
    const action = await loadAction(payload);
    expect(action.$$IS_SIGNATURE_EQUAL("sig", 2)).toBe(true);
    expect(action.$$IS_SIGNATURE_EQUAL("sig", 1)).toBe(false);
    expect(action.$$IS_SIGNATURE_EQUAL("other", 2)).toBe(false);
  });

  it(".bind() creates a new action with accumulated bound args", async () => {
    const calls = [];
    const callServer = (id, args) => {
      calls.push({ id, args });
      return Promise.resolve();
    };
    const payload = '1:{"id":"b","bound":[1]}\n0:"$h1"\n';
    const action = await loadAction(payload, { callServer });
    const bound = action.bind(null, 2, 3);
    expect(bound.$$id).toBe("b");
    await bound("arg");
    // Original bound (1) + new bound (2,3) + runtime (arg)
    expect(calls[0]).toEqual({ id: "b", args: [1, 2, 3, "arg"] });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ReadableStream wrapper — cancel()
// ─────────────────────────────────────────────────────────────────────────────

describe("createStreamWrapper cancel", () => {
  it("marks the chunk as closed when the consumer cancels the stream", async () => {
    // $r1 references a streaming ReadableStream chunk.  1:Thello is a
    // streaming text row (non-length-prefixed — 'h' is not a hex char so
    // processData falls through to processLine's T-tag → appendTextChunk).
    const payload = '0:"$r1"\n1:Thello\n';
    const stream = await createFromReadableStream(streamOf(payload));
    expect(stream).toBeInstanceOf(ReadableStream);
    const reader = stream.getReader();
    const first = await reader.read();
    expect(first.value).toBe("hello");
    // Cancel → triggers cancel() callback on the wrapper
    await reader.cancel();
    // Further reads complete (stream is cancelled/closed)
    const next = await reader.read();
    expect(next.done).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Binary row handling — continueBinaryRow split + processBinaryData new chunk
// ─────────────────────────────────────────────────────────────────────────────

describe("binary row handling", () => {
  it("continueBinaryRow concatenates across multiple small stream chunks", async () => {
    // Length-prefixed T row split across 3 stream deliveries.  The hex length
    // 'a' (10) matches the payload "helloworld".  The split forces processData
    // to build a pendingBinaryRow, continueBinaryRow's "still need more" branch
    // to run once, then the "have enough" branch to complete the row.
    const enc = new TextEncoder();
    const fullRow = enc.encode("1:Ta,helloworld\n");
    // Header "1:Ta," is 5 bytes (indices 0-4), payload 5-14, newline 15
    const p1 = fullRow.slice(0, 7); // "1:Ta,he" — triggers pendingBinaryRow
    const p2 = fullRow.slice(7, 11); // "llow" — still-need-more branch
    const p3 = fullRow.slice(11); // "orld\n" — have-enough branch
    const rootRow = enc.encode('0:"$1"\n');
    const stream = byteStream(p1, p2, p3, rootRow);
    const root = await createFromReadableStream(stream);
    expect(root).toBe("helloworld");
  });

  it("resolves a length-prefixed Uint8Array row to a Uint8Array value", async () => {
    // Tag 'o' (0x6f) → Uint8Array.  Length in hex: 3 bytes of binary [1,2,3].
    const enc = new TextEncoder();
    const header = enc.encode("1:o3,");
    const payload = new Uint8Array([1, 2, 3]);
    const nl = enc.encode('\n0:"$1"\n');
    const combined = new Uint8Array(header.length + payload.length + nl.length);
    combined.set(header, 0);
    combined.set(payload, header.length);
    combined.set(nl, header.length + payload.length);
    const root = await createFromReadableStream(byteStream(combined));
    expect(root).toBeInstanceOf(Uint8Array);
    expect(Array.from(root)).toEqual([1, 2, 3]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Public createServerReference — .bind() chain
// ─────────────────────────────────────────────────────────────────────────────

describe("createServerReference public API", () => {
  it("returns an async action with server-reference metadata", async () => {
    const callServer = vi.fn(async (id, args) => ({ id, args }));
    const action = createServerReference("my-ref", callServer);
    expect(action.$$typeof).toBe(REACT_SERVER_REFERENCE);
    expect(action.$$id).toBe("my-ref");
    expect(action.$$bound).toBeNull();
    const result = await action(1, 2);
    expect(callServer).toHaveBeenCalledWith("my-ref", [1, 2]);
    expect(result).toEqual({ id: "my-ref", args: [1, 2] });
  });

  it(".bind() chains accumulate bound arguments across binds", async () => {
    const calls = [];
    const action = createServerReference("chained", (id, args) => {
      calls.push({ id, args });
      return Promise.resolve();
    });
    const once = action.bind(null, "a");
    const twice = once.bind(null, "b", "c");
    expect(once.$$bound).toEqual(["a"]);
    expect(twice.$$bound).toEqual(["a", "b", "c"]);
    await twice("runtime");
    expect(calls[0]).toEqual({
      id: "chained",
      args: ["a", "b", "c", "runtime"],
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// appendFilesToFormData — walk into $$bound on server references
// ─────────────────────────────────────────────────────────────────────────────

describe("appendFilesToFormData via encodeReply", () => {
  it("traverses $$bound on a server reference to find Files", async () => {
    // Create a server reference that has a File in its bound args.  Pass that
    // reference as a top-level value to encodeReply.  The resulting FormData
    // should contain the File under a bound-scoped key.
    const action = createServerReference("ref", async () => {});
    const file = new File(["hi"], "hello.txt", { type: "text/plain" });
    const boundAction = action.bind(null, file);

    const result = await encodeReply({ action: boundAction });
    // hasFileOrBlob saw the File inside $$bound and FormData branch runs
    expect(result).toBeInstanceOf(FormData);
    // Some FormData entry holds the original File
    let foundFile = null;
    for (const [, v] of result.entries()) {
      if (v instanceof File && v.name === "hello.txt") {
        foundFile = v;
        break;
      }
    }
    expect(foundFile).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// $Y custom TypedArray via typeRegistry
// ─────────────────────────────────────────────────────────────────────────────

describe("$Y typed array typeRegistry lookup", () => {
  it("uses typeRegistry for custom typed-array classes", async () => {
    class MyView {
      constructor(buffer) {
        this.buffer = buffer;
        this.tag = "custom";
      }
      // Non-constructor member so oxlint doesn't flag this as constructor-only
      byteLength() {
        return this.buffer ? this.buffer.byteLength : 0;
      }
    }
    // $Y row encodes {type, data(base64)}.  Base64 of [1,2,3] = "AQID"
    const payload = '0:"$Y{\\"type\\":\\"MyView\\",\\"data\\":\\"AQID\\"}"\n';
    const root = await createFromReadableStream(streamOf(payload), {
      typeRegistry: { MyView },
    });
    expect(root).toBeInstanceOf(MyView);
    expect(root.tag).toBe("custom");
  });
});
