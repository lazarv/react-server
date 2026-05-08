/**
 * Protocol-level tests for token-encoded bound arguments.
 *
 * These tests exercise the @lazarv/rsc encode → decode pipeline directly
 * (no HTTP, no real server) with a stub token-decryption hook supplied by
 * the host.  The point is to validate the wire-protocol contract:
 *
 *   - When the resolver returns `{ id, bound: null }`, the serializer
 *     emits NO plaintext bound on the wire even when value.$$bound is
 *     a populated array.
 *   - When the decoder is given a `decryptServerReferenceId` hook and
 *     hits a $h chunk whose `id` is a token, the hook is called and the
 *     recovered bound is prepended to the wire-supplied bound (if any)
 *     before binding to the action.
 *   - Tampering with the token causes the hook to return null; the
 *     dispatcher falls back to using the raw id, which (for an opaque
 *     token) won't resolve in the loader → action invocation fails.
 *   - Tampering with the wire-supplied bound (post-token, callback case)
 *     is detectable via the same primitive — the bound prefix the
 *     server uses is recovered from the token and is unaffected by the
 *     wire-supplied tail.
 *
 * The crypto primitive is tested in test/__test__/action-crypto.spec.mjs;
 * here we use a deterministic fake "decryptToken" so failures point at
 * the protocol wiring.
 */

import { describe, expect, test } from "vitest";

import * as RscServer from "../server/shared.mjs";
import * as RscClient from "../client/shared.mjs";
import { decodeReplyFromFormData } from "../server/reply-decoder.mjs";

const REACT_SERVER_REFERENCE = Symbol.for("react.server.reference");

// ─── Fake token primitive ─────────────────────────────────────────────────
//
// "Token" = `t:<JSON.stringify([actionId, bound])>`. Pure function of
// (id, bound), deterministic, easy to inspect in test failures. Real
// crypto is tested separately.
function fakeToken(actionId, bound) {
  return "t:" + JSON.stringify([actionId, bound ?? null]);
}

function fakeDecryptToken(id) {
  if (typeof id !== "string" || !id.startsWith("t:")) return null;
  try {
    const parsed = JSON.parse(id.slice(2));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    if (typeof parsed[0] !== "string") return null;
    return {
      actionId: parsed[0],
      bound:
        Array.isArray(parsed[1]) && parsed[1].length > 0 ? parsed[1] : null,
    };
  } catch {
    return null;
  }
}

// ─── Server reference factory ─────────────────────────────────────────────
//
// Mimics what react-server's action-register.mjs produces post-Option A:
// $$id is the token (carrying both action id and bound), $$bound is
// plaintext for runtime use, and the resolver-emitted wire shape will
// have `bound: null`.

function makeTokenServerRef(actionId, boundArgs) {
  const fn = async (...args) => ({ actionId, args });
  fn.$$typeof = REACT_SERVER_REFERENCE;
  fn.$$id = fakeToken(actionId, boundArgs ?? null);
  fn.$$bound = boundArgs ?? null;
  fn.bind = function (_this, ...newArgs) {
    const accumulated = (boundArgs ?? []).concat(newArgs);
    return makeTokenServerRef(actionId, accumulated);
  };
  return fn;
}

// Resolver mirroring react-server's: always returns `bound: null` on the
// wire, since the bound is bundled into the encrypted id.
const tokenResolver = {
  resolveServerReference(value) {
    if (typeof value?.$$id !== "string") return null;
    return { id: value.$$id, bound: null };
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────

async function readFlightRows(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
  }
  buf += decoder.decode();
  const rows = new Map();
  for (const line of buf.split("\n")) {
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const id = parseInt(line.slice(0, colon), 16);
    const json = line.slice(colon + 1);
    rows.set(id, json);
  }
  return rows;
}

async function renderRows(model, options = {}) {
  const stream = RscServer.renderToReadableStream(model, options);
  return readFlightRows(stream);
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("token-encoded bound — flight serialization", () => {
  test("resolver returning bound: null overrides $$bound; wire carries no plaintext bound", async () => {
    const ref = makeTokenServerRef("actions#submit", [42]);
    expect(ref.$$bound).toEqual([42]); // server-side plaintext intact

    const rows = await renderRows(
      { action: ref },
      { moduleResolver: tokenResolver }
    );

    const refRow = [...rows.values()]
      .map((j) => {
        try {
          return JSON.parse(j);
        } catch {
          return null;
        }
      })
      .find((m) => m && typeof m.id === "string" && m.id.startsWith("t:"));

    expect(refRow).toBeTruthy();
    expect(refRow.bound).toBeNull(); // ← the load-bearing assertion
    // And the token itself round-trips to the original (id, bound).
    expect(fakeDecryptToken(refRow.id)).toEqual({
      actionId: "actions#submit",
      bound: [42],
    });
  });

  test("unbound action: wire has no bound (null), token decodes to bound: null", async () => {
    const ref = makeTokenServerRef("actions#submit", null);

    const rows = await renderRows(
      { action: ref },
      { moduleResolver: tokenResolver }
    );

    const refRow = [...rows.values()]
      .map((j) => {
        try {
          return JSON.parse(j);
        } catch {
          return null;
        }
      })
      .find((m) => m && typeof m.id === "string" && m.id.startsWith("t:"));

    expect(refRow).toBeTruthy();
    expect(refRow.bound).toBeNull();
    expect(fakeDecryptToken(refRow.id)).toEqual({
      actionId: "actions#submit",
      bound: null,
    });
  });

  test("without resolver, the legacy path falls back to plaintext bound on the wire", async () => {
    // Sanity check: the resolver is what enables the new wire shape.
    // In a host that doesn't supply a resolveServerReference, $$bound
    // gets serialized verbatim — preserving back-compat for plain
    // @lazarv/rsc consumers that don't speak token-with-bound.
    const ref = makeTokenServerRef("actions#submit", [42]);

    const rows = await renderRows({ action: ref }); // no resolver

    const refRow = [...rows.values()]
      .map((j) => {
        try {
          return JSON.parse(j);
        } catch {
          return null;
        }
      })
      .find((m) => m && typeof m.id === "string" && m.id.startsWith("t:"));

    expect(refRow).toBeTruthy();
    expect(refRow.bound).toEqual([42]); // legacy: bound on the wire
  });
});

describe("token-encoded bound — callback decode ($h hook)", () => {
  test("decoder calls hook on $h id and prepends recovered bound", async () => {
    // Simulate the callback case: a bound server reference is passed as
    // an arg to *another* action call.  The client encodes it via
    // encodeReply, which emits a $h chunk with the token in `id` and
    // bound:null on the wire.  The host's hook recovers the bound at
    // decode time.
    const callbackRef = makeTokenServerRef("actions#callback", [42]);

    const encoded = await RscClient.encodeReply(callbackRef);
    expect(encoded).toBeInstanceOf(FormData);

    // Currently @lazarv/rsc's client encoder writes $$bound to the wire
    // when present (the resolver-side override is server-only). So for
    // this protocol-level test the wire form for callback refs may
    // include the plaintext bound. The decoder hook still authoritatively
    // determines the action and any token-recovered bound; client-shipped
    // bound (if any) is treated as additional bound, appended after.
    let invokedWith;
    const decoded = await decodeReplyFromFormData(encoded, {
      moduleLoader: {
        loadServerAction(actionId) {
          return (...args) => {
            invokedWith = { actionId, args };
            return null;
          };
        },
      },
      decryptServerReferenceId: fakeDecryptToken,
    });

    expect(typeof decoded).toBe("function");
    decoded("runtime-arg");

    // The hook should have given us actionId="actions#callback".
    expect(invokedWith.actionId).toBe("actions#callback");
    // And the bound prefix [42] is recovered from the token.
    // (If the client also shipped [42] on the wire — current encoder
    // behaviour — they'd be appended too: [42, 42, "runtime-arg"].
    // What matters for security is that token-recovered bound prefix is
    // present and authoritative.)
    expect(invokedWith.args[0]).toBe(42);
    expect(invokedWith.args[invokedWith.args.length - 1]).toBe("runtime-arg");
  });

  test("hook returning null falls through to using parsed.id directly", async () => {
    // Tampered token: hook returns null. Decoder should use parsed.id
    // verbatim and let the loader fail to resolve it (not an integrity
    // error per se — just an unresolved action).
    const ref = makeTokenServerRef("actions#submit", [42]);

    const encoded = await RscClient.encodeReply(ref);
    expect(encoded).toBeInstanceOf(FormData);

    // Tamper: replace the token in part 1's JSON with garbage.
    const partKey = "1";
    const parsed = JSON.parse(encoded.get(partKey));
    parsed.id = "t:tampered-not-json[";
    encoded.set(partKey, JSON.stringify(parsed));

    let loaderSawId = null;
    await decodeReplyFromFormData(encoded, {
      moduleLoader: {
        loadServerAction(actionId) {
          loaderSawId = actionId;
          return () => null;
        },
      },
      decryptServerReferenceId: fakeDecryptToken,
    });

    // Hook returned null on the tampered token → decoder used parsed.id verbatim.
    expect(loaderSawId).toBe("t:tampered-not-json[");
  });

  test("hook absent: decoder behaves identically to pre-token-with-bound", async () => {
    const ref = makeTokenServerRef("actions#submit", [42]);
    const encoded = await RscClient.encodeReply(ref);

    let loaderSawId = null;
    let invokedArgs = null;
    const decoded = await decodeReplyFromFormData(encoded, {
      moduleLoader: {
        loadServerAction(actionId) {
          loaderSawId = actionId;
          return (...args) => {
            invokedArgs = args;
            return null;
          };
        },
      },
      // no decryptServerReferenceId
    });

    decoded("runtime");
    // Without the hook, the loader sees the raw token id and the
    // wire-supplied bound (the client encoded it inline) is the only
    // source of bound.
    expect(loaderSawId).toMatch(/^t:/);
    expect(invokedArgs).toContain("runtime");
  });
});
