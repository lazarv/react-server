"use server";

/**
 * Server-function validation fixture: a small set of actions wrapped with
 * `createFunction({...})(handler)` so the spec can drive them from the
 * browser and assert that the protocol-level slot-walk rejects on
 * specification mismatch — before any handler code runs.
 *
 * The handlers themselves are intentionally trivial: if they ever
 * execute, the test should observe a non-error result, which is how we
 * verify the "validation aborted before handler" contract — the
 * negative test paths must never reach the assignment in the handler.
 */

import {
  createFunction,
  formData,
  file,
  arrayBuffer,
  typedArray,
  map,
  set,
  stream,
  asyncIterable,
  iterable,
  promise,
} from "@lazarv/react-server/function";

// Minimal Standard-Schema duck-types — keeps the fixture dep-light. The
// runtime's `safeValidate` accepts any object with `safeParse` /
// `assert` / `parse`. We use `safeParse` here.
function strSchema() {
  return {
    safeParse(v) {
      if (typeof v === "string") return { success: true, data: v };
      return { success: false, error: { message: "expected string" } };
    },
  };
}
function numSchema() {
  return {
    safeParse(v) {
      if (typeof v === "number" && Number.isFinite(v))
        return { success: true, data: v };
      return { success: false, error: { message: "expected finite number" } };
    },
  };
}
function minLen(n) {
  return {
    safeParse(v) {
      if (typeof v === "string" && v.length >= n)
        return { success: true, data: v };
      return { success: false, error: { message: `expected min length ${n}` } };
    },
  };
}

// ─── Action 1: simple two-arg validation ────────────────────────────────
//
// Slot 0: string. Slot 1: number. Returns a description of what the
// handler saw — the spec asserts this only when both args validated.

export const greet = createFunction([strSchema(), numSchema()])(
  async function greet(name, age) {
    return { kind: "ok", name, age, handlerRan: true };
  }
);

// ─── Action 2: parse → validate, in that order ──────────────────────────
//
// `parse[0]` coerces the wire string into a number; `validate[0]` then
// asserts it's a finite number. Lets the spec verify parse runs before
// validate (a "42" wire value passes; "not-a-number" fails parse).

export const parsedNumber = createFunction({
  parse: [(v) => Number(v)],
  validate: [numSchema()],
})(async function parsedNumber(n) {
  return { kind: "ok", n, handlerRan: true };
});

// ─── Action 3: validation rejects → handler never runs ──────────────────
//
// Slot 0 requires a 5-char minimum. Spec calls with a too-short string
// and asserts the client receives an error AND the handler did NOT
// observe the call (no global side-effect set).

let sideEffectMarker = null;
export function readSideEffect() {
  return sideEffectMarker;
}
export function resetSideEffect() {
  sideEffectMarker = null;
  return true;
}

export const tooShort = createFunction([minLen(5)])(async function tooShort(s) {
  // If the slot-walk is broken and this runs, the side effect surfaces
  // in a follow-up readSideEffect() call from the spec.
  sideEffectMarker = s;
  return { kind: "ok", s, handlerRan: true };
});

// ─── Action 4: formData with file() entry ────────────────────────────
//
// Slot 0 is a sub-FormData with declared `title` (string) and `photo`
// (file with maxBytes + mime). The handler returns what it read from
// the validated FormData. The spec drives both happy-path and
// rejection-path (oversize file, wrong MIME, injected key).

export const upload = createFunction([
  formData({
    title: strSchema(),
    photo: file({
      maxBytes: 64,
      mime: ["image/png", "image/jpeg"],
    }),
  }),
])(async function upload(form) {
  const photo = form.get("photo");
  return {
    kind: "ok",
    title: form.get("title"),
    photoSize: photo?.size ?? null,
    photoType: photo?.type ?? null,
    handlerRan: true,
  };
});

// ─── Wire-aware Flight-protocol helpers ─────────────────────────────────
//
// Each handler covers one wire-aware spec from
// `@lazarv/react-server/function`. Tests drive both happy-path inputs
// (handler runs and reports back what it observed) and rejection
// inputs (handler must NOT run; client receives an error). The spec
// reads `kind` to distinguish the two outcomes, and the size /
// constructor / chunk-count fields to confirm the value the slot-walk
// passed through.

// arrayBuffer — caps at 16 bytes. Oversize → max_bytes_exceeded.
export const echoArrayBuffer = createFunction([arrayBuffer({ maxBytes: 16 })])(
  async function echoArrayBuffer(buf) {
    return {
      kind: "ok",
      isArrayBuffer: buf instanceof ArrayBuffer,
      byteLength: buf.byteLength,
      first: new Uint8Array(buf)[0],
      handlerRan: true,
    };
  }
);

// typedArray — only Uint8Array allowed, up to 16 bytes. Float32Array
// payloads → wire_shape_mismatch. Larger Uint8Array → max_bytes_exceeded.
export const echoTypedArray = createFunction([
  typedArray({ ctor: Uint8Array, maxBytes: 16 }),
])(async function echoTypedArray(arr) {
  return {
    kind: "ok",
    ctor: arr.constructor.name,
    byteLength: arr.byteLength,
    first: arr[0],
    handlerRan: true,
  };
});

// map — caps at 3 entries; values must be numbers.
export const echoMap = createFunction([
  map({ maxSize: 3, key: strSchema(), value: numSchema() }),
])(async function echoMap(m) {
  return {
    kind: "ok",
    isMap: m instanceof Map,
    size: m.size,
    entries: [...m.entries()],
    handlerRan: true,
  };
});

// set — caps at 3 items; items must be strings.
export const echoSet = createFunction([
  set({ maxSize: 3, value: strSchema() }),
])(async function echoSet(s) {
  return {
    kind: "ok",
    isSet: s instanceof Set,
    size: s.size,
    items: [...s].toSorted(),
    handlerRan: true,
  };
});

// stream — caps at 3 chunks. Reading a 4th chunk through the wrapped
// stream errors at the consumer. The handler drains and reports.
export const echoStream = createFunction([stream({ maxChunks: 3 })])(
  async function echoStream(s) {
    const chunks = [];
    let drainError = null;
    const reader = s.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    } catch (err) {
      drainError = String(err?.reason ?? err?.message ?? err);
    }
    return {
      kind: "ok",
      chunkCount: chunks.length,
      drainError,
      handlerRan: true,
    };
  }
);

// asyncIterable — caps at 2 yields; values must be numbers.
export const echoAsyncIterable = createFunction([
  asyncIterable({ maxYields: 2, value: numSchema() }),
])(async function echoAsyncIterable(it) {
  const collected = [];
  let drainError = null;
  try {
    for await (const v of it) collected.push(v);
  } catch (err) {
    drainError = String(err?.reason ?? err?.message ?? err);
  }
  return {
    kind: "ok",
    yields: collected,
    drainError,
    handlerRan: true,
  };
});

// iterable — sync, caps at 2 yields. Same shape as the async case.
export const echoIterable = createFunction([
  iterable({ maxYields: 2, value: numSchema() }),
])(async function echoIterable(it) {
  const collected = [];
  let drainError = null;
  try {
    for (const v of it) collected.push(v);
  } catch (err) {
    drainError = String(err?.reason ?? err?.message ?? err);
  }
  return {
    kind: "ok",
    yields: collected,
    drainError,
    handlerRan: true,
  };
});

// promise — resolved value must be a string.
export const echoPromise = createFunction([promise(strSchema())])(
  async function echoPromise(p) {
    let value = null;
    let awaitError = null;
    try {
      value = await p;
    } catch (err) {
      awaitError = String(err?.reason ?? err?.message ?? err);
    }
    return {
      kind: "ok",
      value,
      awaitError,
      handlerRan: true,
    };
  }
);

// ─── Final action: bare "use server" without createFunction ─────────────
//
// Same module, same `"use server"` directive — no `createFunction`
// wrapper, so no meta is registered. Spec calls with anything and
// asserts the handler runs unchanged (legacy walk path).

export async function bareEcho(value) {
  return { kind: "ok", value, handlerRan: true };
}
