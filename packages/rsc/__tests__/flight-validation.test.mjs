/**
 * Protocol-level tests for createFunction slot-walk validation in decodeReply.
 *
 * Exercises the encode → decode pipeline with `lookupServerFunctionMeta`
 * driving per-arg parse/validate. The aim is the wire-protocol contract,
 * not the higher-level @lazarv/react-server `createFunction` ergonomics
 * (which are tested separately, end-to-end). We assert:
 *
 *   - When meta is registered, the slot-walk runs and returns the
 *     validated args; bound captures (when present) are NOT in the args
 *     array — they're integrity-protected by the token, not by this path.
 *   - A failing Standard Schema in `validate[i]` throws
 *     `DecodeValidationError` with the right `argIndex` / `reason`, and
 *     no subsequent slot is touched.
 *   - `parse[i]` runs before `validate[i]`, and a parse throw surfaces
 *     as `reason: "parse_failed"`.
 *   - Wire-aware specs (`_kind: "formdata"`) drive the
 *     `decodeFormDataSlot` path: declared entries are looked up by exact
 *     key, and the default `unknown` policy ("reject") aborts on
 *     injected fields. We also exercise `"drop"` explicitly.
 *   - File / Blob entry constraints reject on `maxBytes`, `mime`, and
 *     `validate` failures synchronously, before the decode advances.
 *   - Bare actions (no meta) still take the legacy whole-tree walk —
 *     back-compat is preserved.
 */

import { describe, expect, test } from "vitest";

import {
  registerServerReference,
  lookupServerFunctionMeta,
  DecodeValidationError,
  decodeReply,
} from "../server/index.mjs";
import {
  decodeReplyFromString,
  decodeReplyFromFormData,
} from "../server/reply-decoder.mjs";
import { encodeReply } from "../client/shared.mjs";

// ─── Schema bridge under test ────────────────────────────────────────────
//
// The decoder doesn't know Zod / Valibot / etc. — the host bridges via
// `validateArg`. We use the simplest possible bridge: a `safeParse`
// duck-type. Real react-server delegates to `safeValidate`, which is
// equivalent.
function validateArg(spec, value /* , ctx */) {
  if (spec && typeof spec.safeParse === "function") {
    const r = spec.safeParse(value);
    if (r.success) return { success: true, data: r.data };
    return { success: false, error: r.error };
  }
  return { success: true, data: value };
}

// Minimal Zod-style schema factory for the tests. Keeps the test file
// self-contained — no zod dep needed. `safeParse(v) → { success, data }`
// matches what the bridge expects.
function schema(predicate, message = "predicate failed") {
  return {
    safeParse(v) {
      if (predicate(v)) return { success: true, data: v };
      return { success: false, error: { message } };
    },
  };
}

const string = () => schema((v) => typeof v === "string", "expected string");
const number = () => schema((v) => typeof v === "number", "expected number");
const min = (n) =>
  schema((v) => typeof v === "string" && v.length >= n, `min ${n}`);

// ─── Helper: register a fake action with meta ────────────────────────────

function registerAction(id, name, meta) {
  const fn = async (...args) => ({ id: `${id}#${name}`, args });
  return registerServerReference(fn, id, name, meta);
}

const resolveMeta = (actionId) => lookupServerFunctionMeta(actionId);

// ─── Tests ───────────────────────────────────────────────────────────────

describe("decodeReplyFromString — slot-walk validation", () => {
  test("validates each arg against its Standard Schema", async () => {
    registerAction("test/a.mjs", "greet", {
      validate: [string(), number()],
    });
    const body = JSON.stringify(["hello", 42]);
    const out = decodeReplyFromString(body, {
      actionId: "test/a.mjs#greet",
      resolveServerFunctionMeta: resolveMeta,
      validateArg,
    });
    expect(out).toEqual(["hello", 42]);
  });

  test("rejects with DecodeValidationError on first failing slot", async () => {
    registerAction("test/a.mjs", "greet2", {
      validate: [string(), min(5)],
    });
    const body = JSON.stringify(["ok", "hi"]); // slot 1 fails min(5)
    expect(() =>
      decodeReplyFromString(body, {
        actionId: "test/a.mjs#greet2",
        resolveServerFunctionMeta: resolveMeta,
        validateArg,
      })
    ).toThrow(DecodeValidationError);
    try {
      decodeReplyFromString(body, {
        actionId: "test/a.mjs#greet2",
        resolveServerFunctionMeta: resolveMeta,
        validateArg,
      });
    } catch (err) {
      expect(err).toBeInstanceOf(DecodeValidationError);
      expect(err.argIndex).toBe(1);
      expect(err.reason).toBe("validate_failed");
      expect(err.actionId).toBe("test/a.mjs#greet2");
    }
  });

  test("parse runs before validate; parse throw → parse_failed", async () => {
    registerAction("test/a.mjs", "greet3", {
      parse: [
        (_v) => {
          throw new Error("nope");
        },
      ],
      validate: [string()],
    });
    const body = JSON.stringify(["whatever"]);
    try {
      decodeReplyFromString(body, {
        actionId: "test/a.mjs#greet3",
        resolveServerFunctionMeta: resolveMeta,
        validateArg,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DecodeValidationError);
      expect(err.argIndex).toBe(0);
      expect(err.reason).toBe("parse_failed");
    }
  });

  test("parse output flows into validate", async () => {
    registerAction("test/a.mjs", "greet4", {
      parse: [(v) => Number(v)],
      validate: [number()],
    });
    const body = JSON.stringify(["42"]);
    const out = decodeReplyFromString(body, {
      actionId: "test/a.mjs#greet4",
      resolveServerFunctionMeta: resolveMeta,
      validateArg,
    });
    expect(out).toEqual([42]);
  });

  test("bare action (no meta) takes the legacy whole-tree walk", async () => {
    // No meta registered → resolveServerFunctionMeta returns undefined →
    // decoder falls through to the unvalidated walk and accepts anything.
    const body = JSON.stringify(["anything", { nested: true }]);
    const out = decodeReplyFromString(body, {
      actionId: "test/a.mjs#unknown_action",
      resolveServerFunctionMeta: resolveMeta,
      validateArg,
    });
    expect(out).toEqual(["anything", { nested: true }]);
  });

  test("missing actionId falls through to legacy walk", async () => {
    registerAction("test/a.mjs", "greet5", {
      validate: [string()],
    });
    // Same registered action exists, but if the host doesn't pass
    // actionId we don't run the slot-walk. This is the back-compat path
    // for non-server-function callers of decodeReply.
    const body = JSON.stringify([42]); // would fail string() if walked
    const out = decodeReplyFromString(body, {
      // no actionId
      resolveServerFunctionMeta: resolveMeta,
      validateArg,
    });
    expect(out).toEqual([42]);
  });
});

describe("decodeReplyFromFormData — formData slot", () => {
  function makeFormBody(rootValue, parts) {
    const fd = new FormData();
    fd.append("0", JSON.stringify(rootValue));
    for (const [k, v] of Object.entries(parts)) {
      fd.append(k, v);
    }
    return fd;
  }

  test("declared entries are looked up by exact key; unknown rejected", async () => {
    const fileSpec = { _kind: "file", maxBytes: 1024 };
    const formSpec = {
      _kind: "formdata",
      entries: { title: string(), photo: fileSpec },
    };
    registerAction("test/u.mjs", "upload", {
      validate: [formSpec],
    });

    const photo = new File([new Uint8Array(10)], "p.png", {
      type: "image/png",
    });
    const fd = makeFormBody(["$K1"], {
      "1_title": "hello",
      "1_photo": photo,
    });
    const out = decodeReplyFromFormData(fd, {
      actionId: "test/u.mjs#upload",
      resolveServerFunctionMeta: resolveMeta,
      validateArg,
    });
    expect(Array.isArray(out)).toBe(true);
    expect(out[0]).toBeInstanceOf(FormData);
    expect(out[0].get("title")).toBe("hello");
    expect(out[0].get("photo")).toBe(photo);
  });

  test("default policy ('reject') aborts on attacker-injected entry", async () => {
    // Spec deliberately omits `unknown` — the decoder must default to
    // reject. This is the load-bearing security default; flipping it
    // unnoticed would silently weaken every formData() consumer.
    const formSpec = {
      _kind: "formdata",
      entries: { title: string() },
    };
    registerAction("test/u.mjs", "upload2", {
      validate: [formSpec],
    });

    const fd = makeFormBody(["$K1"], {
      "1_title": "ok",
      "1_role": "admin", // attacker injection
    });
    try {
      decodeReplyFromFormData(fd, {
        actionId: "test/u.mjs#upload2",
        resolveServerFunctionMeta: resolveMeta,
        validateArg,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DecodeValidationError);
      expect(err.reason).toBe("unknown_entry");
      expect(err.original).toEqual({ entry: "role" });
    }
  });

  test("unknown:'drop' silently skips undeclared entries", async () => {
    const formSpec = {
      _kind: "formdata",
      entries: { title: string() },
      unknown: "drop",
    };
    registerAction("test/u.mjs", "upload3", {
      validate: [formSpec],
    });
    const fd = makeFormBody(["$K1"], {
      "1_title": "ok",
      "1_role": "admin", // dropped
    });
    const [resultFd] = decodeReplyFromFormData(fd, {
      actionId: "test/u.mjs#upload3",
      resolveServerFunctionMeta: resolveMeta,
      validateArg,
    });
    expect(resultFd.get("title")).toBe("ok");
    expect(resultFd.get("role")).toBe(null);
  });

  test("file maxBytes exceeded → max_bytes_exceeded", async () => {
    const formSpec = {
      _kind: "formdata",
      entries: {
        photo: { _kind: "file", maxBytes: 4 },
      },
    };
    registerAction("test/u.mjs", "upload4", {
      validate: [formSpec],
    });
    const photo = new File([new Uint8Array(8)], "p.png", { type: "image/png" });
    const fd = makeFormBody(["$K1"], { "1_photo": photo });
    try {
      decodeReplyFromFormData(fd, {
        actionId: "test/u.mjs#upload4",
        resolveServerFunctionMeta: resolveMeta,
        validateArg,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DecodeValidationError);
      expect(err.reason).toBe("max_bytes_exceeded");
      expect(err.original.size).toBe(8);
      expect(err.original.limit).toBe(4);
    }
  });

  test("file mime not allowed → mime_not_allowed", async () => {
    const formSpec = {
      _kind: "formdata",
      entries: {
        photo: { _kind: "file", mime: ["image/png"] },
      },
    };
    registerAction("test/u.mjs", "upload5", {
      validate: [formSpec],
    });
    const photo = new File([new Uint8Array(2)], "p.gif", { type: "image/gif" });
    const fd = makeFormBody(["$K1"], { "1_photo": photo });
    try {
      decodeReplyFromFormData(fd, {
        actionId: "test/u.mjs#upload5",
        resolveServerFunctionMeta: resolveMeta,
        validateArg,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DecodeValidationError);
      expect(err.reason).toBe("mime_not_allowed");
      expect(err.original.mime).toBe("image/gif");
    }
  });

  test("optional file entry — missing accepted", async () => {
    const formSpec = {
      _kind: "formdata",
      entries: {
        photo: { _kind: "file", optional: true },
      },
    };
    registerAction("test/u.mjs", "upload6", {
      validate: [formSpec],
    });
    const fd = makeFormBody(["$K1"], {});
    const [resultFd] = decodeReplyFromFormData(fd, {
      actionId: "test/u.mjs#upload6",
      resolveServerFunctionMeta: resolveMeta,
      validateArg,
    });
    expect(resultFd.get("photo")).toBe(null);
  });

  test("required file entry missing → missing_entry", async () => {
    const formSpec = {
      _kind: "formdata",
      entries: {
        photo: { _kind: "file" },
      },
    };
    registerAction("test/u.mjs", "upload7", {
      validate: [formSpec],
    });
    const fd = makeFormBody(["$K1"], {});
    try {
      decodeReplyFromFormData(fd, {
        actionId: "test/u.mjs#upload7",
        resolveServerFunctionMeta: resolveMeta,
        validateArg,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DecodeValidationError);
      expect(err.reason).toBe("missing_entry");
    }
  });

  test("formData slot expects $K reference; bare value rejected", async () => {
    const formSpec = {
      _kind: "formdata",
      entries: { x: string() },
    };
    registerAction("test/u.mjs", "upload8", {
      validate: [formSpec],
    });
    // Wire shape: arg slot 0 is a string, not a $K reference.
    const fd = makeFormBody(["just a string"], {});
    try {
      decodeReplyFromFormData(fd, {
        actionId: "test/u.mjs#upload8",
        resolveServerFunctionMeta: resolveMeta,
        validateArg,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DecodeValidationError);
      expect(err.reason).toBe("wire_shape_mismatch");
    }
  });

  test("custom validate returning false → custom_validate_failed", async () => {
    const formSpec = {
      _kind: "formdata",
      entries: {
        photo: {
          _kind: "file",
          validate: () => false, // always reject
        },
      },
    };
    registerAction("test/u.mjs", "upload9", {
      validate: [formSpec],
    });
    const photo = new File([new Uint8Array(1)], "p.png", { type: "image/png" });
    const fd = makeFormBody(["$K1"], { "1_photo": photo });
    try {
      decodeReplyFromFormData(fd, {
        actionId: "test/u.mjs#upload9",
        resolveServerFunctionMeta: resolveMeta,
        validateArg,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DecodeValidationError);
      expect(err.reason).toBe("custom_validate_failed");
    }
  });
});

// ─── Wire-aware helpers for the rest of the Flight protocol ──────────────
//
// These tests round-trip values through `encodeReply` (client) →
// `decodeReply` (server with meta), exercising the same wire format the
// runtime emits. A fake host hook provides actionId / meta resolution
// and the same Standard-Schema bridge as above.

async function decodeWith(actionId, body) {
  return decodeReply(body, {
    actionId,
    resolveServerFunctionMeta: resolveMeta,
    validateArg,
  });
}

describe("decodeReply — arrayBuffer slot", () => {
  test("accepts an ArrayBuffer within maxBytes", async () => {
    registerAction("test/buf.mjs", "ab1", {
      validate: [{ _kind: "arrayBuffer", maxBytes: 16 }],
    });
    const ab = new Uint8Array([1, 2, 3, 4]).buffer;
    const body = await encodeReply([ab]);
    const out = await decodeWith("test/buf.mjs#ab1", body);
    expect(out[0]).toBeInstanceOf(ArrayBuffer);
    expect(out[0].byteLength).toBe(4);
  });

  test("rejects oversize ArrayBuffer with max_bytes_exceeded", async () => {
    registerAction("test/buf.mjs", "ab2", {
      validate: [{ _kind: "arrayBuffer", maxBytes: 4 }],
    });
    const ab = new Uint8Array(16).buffer;
    const body = await encodeReply([ab]);
    try {
      await decodeWith("test/buf.mjs#ab2", body);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DecodeValidationError);
      expect(err.reason).toBe("max_bytes_exceeded");
      expect(err.original).toMatchObject({ size: 16, limit: 4 });
    }
  });

  test("rejects non-ArrayBuffer with wire_shape_mismatch", async () => {
    registerAction("test/buf.mjs", "ab3", {
      validate: [{ _kind: "arrayBuffer" }],
    });
    const body = await encodeReply(["not a buffer"]);
    try {
      await decodeWith("test/buf.mjs#ab3", body);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DecodeValidationError);
      expect(err.reason).toBe("wire_shape_mismatch");
    }
  });
});

describe("decodeReply — typedArray slot", () => {
  test("accepts a value matching the constructor allowlist", async () => {
    registerAction("test/ta.mjs", "ta1", {
      validate: [{ _kind: "typedArray", ctor: [Uint8Array], maxBytes: 16 }],
    });
    const arr = new Uint8Array([1, 2, 3, 4]);
    const body = await encodeReply([arr]);
    const out = await decodeWith("test/ta.mjs#ta1", body);
    expect(out[0]).toBeInstanceOf(Uint8Array);
    expect(Array.from(out[0])).toEqual([1, 2, 3, 4]);
  });

  test("rejects a non-listed constructor with wire_shape_mismatch", async () => {
    registerAction("test/ta.mjs", "ta2", {
      validate: [{ _kind: "typedArray", ctor: [Uint8Array] }],
    });
    const arr = new Float32Array([1.5]);
    const body = await encodeReply([arr]);
    try {
      await decodeWith("test/ta.mjs#ta2", body);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DecodeValidationError);
      expect(err.reason).toBe("wire_shape_mismatch");
      expect(err.original).toMatchObject({
        expected: "Uint8Array",
        received: "Float32Array",
      });
    }
  });

  test("respects maxBytes on the typed-array's byteLength", async () => {
    registerAction("test/ta.mjs", "ta3", {
      validate: [{ _kind: "typedArray", maxBytes: 4 }],
    });
    const arr = new Uint8Array(8);
    const body = await encodeReply([arr]);
    try {
      await decodeWith("test/ta.mjs#ta3", body);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DecodeValidationError);
      expect(err.reason).toBe("max_bytes_exceeded");
    }
  });
});

describe("decodeReply — map slot", () => {
  test("accepts a Map within maxSize and inner schemas", async () => {
    registerAction("test/m.mjs", "m1", {
      validate: [
        {
          _kind: "map",
          maxSize: 5,
          key: string(),
          value: number(),
        },
      ],
    });
    const m = new Map([
      ["a", 1],
      ["b", 2],
    ]);
    const body = await encodeReply([m]);
    const out = await decodeWith("test/m.mjs#m1", body);
    expect(out[0]).toBeInstanceOf(Map);
    expect(out[0].get("a")).toBe(1);
    expect(out[0].get("b")).toBe(2);
  });

  test("rejects oversize Map with max_size_exceeded", async () => {
    registerAction("test/m.mjs", "m2", {
      validate: [{ _kind: "map", maxSize: 1 }],
    });
    const m = new Map([
      ["a", 1],
      ["b", 2],
    ]);
    const body = await encodeReply([m]);
    try {
      await decodeWith("test/m.mjs#m2", body);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DecodeValidationError);
      expect(err.reason).toBe("max_size_exceeded");
    }
  });

  test("rejects values that fail the inner schema", async () => {
    registerAction("test/m.mjs", "m3", {
      validate: [{ _kind: "map", value: number() }],
    });
    const m = new Map([["a", "not-a-number"]]);
    const body = await encodeReply([m]);
    try {
      await decodeWith("test/m.mjs#m3", body);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DecodeValidationError);
      expect(err.reason).toBe("validate_failed");
    }
  });
});

describe("decodeReply — set slot", () => {
  test("accepts a Set within maxSize and per-item schema", async () => {
    registerAction("test/s.mjs", "s1", {
      validate: [{ _kind: "set", maxSize: 5, value: string() }],
    });
    const s = new Set(["a", "b"]);
    const body = await encodeReply([s]);
    const out = await decodeWith("test/s.mjs#s1", body);
    expect(out[0]).toBeInstanceOf(Set);
    expect(out[0].has("a")).toBe(true);
  });

  test("rejects oversize Set with max_size_exceeded", async () => {
    registerAction("test/s.mjs", "s2", {
      validate: [{ _kind: "set", maxSize: 1 }],
    });
    const body = await encodeReply([new Set(["a", "b", "c"])]);
    try {
      await decodeWith("test/s.mjs#s2", body);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DecodeValidationError);
      expect(err.reason).toBe("max_size_exceeded");
    }
  });
});

describe("decodeReply — stream slot", () => {
  test("returns a ReadableStream and enforces maxChunks on consumption", async () => {
    registerAction("test/st.mjs", "st1", {
      validate: [{ _kind: "stream", maxChunks: 2 }],
    });
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue("a");
        controller.enqueue("b");
        controller.enqueue("c");
        controller.close();
      },
    });
    const body = await encodeReply([stream]);
    const out = await decodeWith("test/st.mjs#st1", body);
    expect(out[0]).toBeInstanceOf(ReadableStream);

    // Drain the wrapped stream — must error on the 3rd chunk.
    const reader = out[0].getReader();
    const r1 = await reader.read();
    const r2 = await reader.read();
    expect(r1.value).toBe("a");
    expect(r2.value).toBe("b");
    let caught;
    try {
      await reader.read();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(DecodeValidationError);
    expect(caught.reason).toBe("max_chunks_exceeded");
  });

  test("fast path: no bounds → stream not wrapped", async () => {
    registerAction("test/st.mjs", "st2", {
      validate: [{ _kind: "stream" }],
    });
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue("only");
        controller.close();
      },
    });
    const body = await encodeReply([stream]);
    const out = await decodeWith("test/st.mjs#st2", body);
    const reader = out[0].getReader();
    expect((await reader.read()).value).toBe("only");
    expect((await reader.read()).done).toBe(true);
  });
});

describe("decodeReply — asyncIterable slot", () => {
  test("yields each item through the inner schema, capped at maxYields", async () => {
    registerAction("test/ai.mjs", "ai1", {
      validate: [{ _kind: "asyncIterable", maxYields: 2, value: string() }],
    });
    async function* source() {
      yield "a";
      yield "b";
      yield "c";
    }
    const body = await encodeReply([source()]);
    const out = await decodeWith("test/ai.mjs#ai1", body);

    const collected = [];
    let caught;
    try {
      for await (const v of out[0]) collected.push(v);
    } catch (err) {
      caught = err;
    }
    expect(collected).toEqual(["a", "b"]);
    expect(caught).toBeInstanceOf(DecodeValidationError);
    expect(caught.reason).toBe("max_yields_exceeded");
  });

  test("rejects items that fail the inner schema", async () => {
    registerAction("test/ai.mjs", "ai2", {
      validate: [{ _kind: "asyncIterable", value: number() }],
    });
    async function* source() {
      yield 1;
      yield "two"; // wrong type
    }
    const body = await encodeReply([source()]);
    const out = await decodeWith("test/ai.mjs#ai2", body);
    let caught;
    try {
      for await (const _value of out[0]) {
        void _value;
      }
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(DecodeValidationError);
    expect(caught.reason).toBe("validate_failed");
  });
});

describe("decodeReply — iterable slot", () => {
  test("yields with bounds enforced on each next() pull", async () => {
    registerAction("test/it.mjs", "it1", {
      validate: [{ _kind: "iterable", maxYields: 1 }],
    });
    function* source() {
      yield 1;
      yield 2;
    }
    const body = await encodeReply([source()]);
    const out = await decodeWith("test/it.mjs#it1", body);
    const iterator = out[0][Symbol.iterator]();
    expect(iterator.next().value).toBe(1);
    expect(() => iterator.next()).toThrow(DecodeValidationError);
  });
});

describe("decodeReply — promise slot", () => {
  test("accepts a Promise resolving to a value matching inner schema", async () => {
    registerAction("test/p.mjs", "p1", {
      validate: [{ _kind: "promise", value: string() }],
    });
    const body = await encodeReply([Promise.resolve("hello")]);
    const out = await decodeWith("test/p.mjs#p1", body);
    expect(out[0]).toBeInstanceOf(Promise);
    await expect(out[0]).resolves.toBe("hello");
  });

  test("rejects when resolved value fails the inner schema", async () => {
    registerAction("test/p.mjs", "p2", {
      validate: [{ _kind: "promise", value: number() }],
    });
    const body = await encodeReply([Promise.resolve("not a number")]);
    const out = await decodeWith("test/p.mjs#p2", body);
    let caught;
    try {
      await out[0];
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(DecodeValidationError);
    expect(caught.reason).toBe("validate_failed");
  });

  test("no inner schema → resolves passthrough", async () => {
    registerAction("test/p.mjs", "p3", {
      validate: [{ _kind: "promise" }],
    });
    const body = await encodeReply([Promise.resolve({ any: "shape" })]);
    const out = await decodeWith("test/p.mjs#p3", body);
    await expect(out[0]).resolves.toEqual({ any: "shape" });
  });
});
