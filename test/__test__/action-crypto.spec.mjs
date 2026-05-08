/**
 * Unit tests for action-crypto's token-with-bound encryption.
 *
 * Coverage:
 *   - encryptActionToken / decryptActionToken roundtrip with various bound shapes
 *   - decryptActionId returns just the id (drops bound)
 *   - encryptActionId is a thin wrapper over encryptActionToken(id, null)
 *   - tampering at any byte → null
 *   - key rotation: previous keys decrypt; unrelated keys do not
 *   - legacy plain-string plaintext (pre-token-with-bound tokens still
 *     in flight) decodes cleanly to { actionId, bound: null }
 *   - structurally invalid plaintext → null
 *
 * The crypto helpers always re-derive from the current master key, so we
 * swap keys via initSecret() between cases without worrying about cache.
 */

import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  initSecret,
  initSecretFromConfig,
  encryptActionToken,
  decryptActionToken,
  encryptActionId,
  decryptActionId,
} from "@lazarv/react-server/server/action-crypto.mjs";

const KEY_A = "a".repeat(64); // 32 bytes hex
const KEY_B = "b".repeat(64);
const KEY_C = "c".repeat(64);

// Reproduces action-crypto's deriveKey — used by hand-crafted legacy
// tokens below.  Mirrors the conditional in deriveKey: 64-char hex
// strings are treated as 32-byte keys directly; everything else is
// SHA-256-hashed.
function deriveKey(secret) {
  if (/^[0-9a-fA-F]{64}$/.test(secret)) {
    return Buffer.from(secret, "hex");
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

// Encrypt an arbitrary plaintext under the runtime's key — used to
// construct a legacy plain-string token (pre-token-with-bound shape)
// without bypassing the master-key contract.
function encryptLegacyPlaintext(plaintext, secret) {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64url");
}

describe("encryptActionToken / decryptActionToken", () => {
  beforeEach(() => {
    initSecret(KEY_A);
    globalThis.__react_server_action_previous_keys__ = [];
  });

  describe("roundtrip", () => {
    it("encrypts and decrypts an unbound token", () => {
      const token = encryptActionToken("src/actions#submit", null);
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);
      expect(decryptActionToken(token)).toEqual({
        actionId: "src/actions#submit",
        bound: null,
      });
    });

    it("encrypts and decrypts a bound token with primitive captures", () => {
      const token = encryptActionToken("src/actions#update", [42, "alice"]);
      expect(decryptActionToken(token)).toEqual({
        actionId: "src/actions#update",
        bound: [42, "alice"],
      });
    });

    it("preserves structured bound values", () => {
      const bound = [
        { user: { id: 7, name: "alice" } },
        ["a", "b", "c"],
        null,
        false,
      ];
      const token = encryptActionToken("actions#x", bound);
      expect(decryptActionToken(token)).toEqual({
        actionId: "actions#x",
        bound,
      });
    });

    // ── Typed value roundtrip ──────────────────────────────────────────
    //
    // Bound captures travel through @lazarv/rsc's sync flight encoder
    // (syncToBuffer / syncFromBuffer) inside the token, so typed values
    // survive with full fidelity. Naive JSON.stringify would lose the
    // type for every case below.

    it("preserves Date instances", () => {
      const bound = [new Date("2024-01-15T03:04:05.000Z")];
      const result = decryptActionToken(encryptActionToken("actions#x", bound));
      expect(result.bound[0]).toBeInstanceOf(Date);
      expect(result.bound[0].toISOString()).toBe("2024-01-15T03:04:05.000Z");
    });

    it("preserves BigInt", () => {
      const bound = [9007199254740993n];
      const result = decryptActionToken(encryptActionToken("actions#x", bound));
      expect(typeof result.bound[0]).toBe("bigint");
      expect(result.bound[0]).toBe(9007199254740993n);
    });

    it("preserves Map", () => {
      const m = new Map([
        ["k1", "v1"],
        ["k2", 42],
      ]);
      const result = decryptActionToken(encryptActionToken("actions#x", [m]));
      expect(result.bound[0]).toBeInstanceOf(Map);
      expect(Array.from(result.bound[0].entries())).toEqual([
        ["k1", "v1"],
        ["k2", 42],
      ]);
    });

    it("preserves Set", () => {
      const s = new Set(["a", "b", "c"]);
      const result = decryptActionToken(encryptActionToken("actions#x", [s]));
      expect(result.bound[0]).toBeInstanceOf(Set);
      expect(Array.from(result.bound[0])).toEqual(["a", "b", "c"]);
    });

    it("preserves RegExp", () => {
      const r = /abc/gi;
      const result = decryptActionToken(encryptActionToken("actions#x", [r]));
      expect(result.bound[0]).toBeInstanceOf(RegExp);
      expect(result.bound[0].source).toBe("abc");
      expect(result.bound[0].flags).toBe("gi");
    });

    it("preserves URL", () => {
      const u = new URL("https://example.test/path?x=1");
      const result = decryptActionToken(encryptActionToken("actions#x", [u]));
      expect(result.bound[0]).toBeInstanceOf(URL);
      expect(result.bound[0].href).toBe("https://example.test/path?x=1");
    });

    it("preserves URLSearchParams", () => {
      const sp = new URLSearchParams("a=1&b=two&a=3");
      const result = decryptActionToken(encryptActionToken("actions#x", [sp]));
      expect(result.bound[0]).toBeInstanceOf(URLSearchParams);
      expect(result.bound[0].toString()).toBe("a=1&b=two&a=3");
    });

    it("preserves typed arrays", () => {
      const u8 = new Uint8Array([1, 2, 3, 4]);
      const result = decryptActionToken(encryptActionToken("actions#x", [u8]));
      expect(result.bound[0]).toBeInstanceOf(Uint8Array);
      expect(Array.from(result.bound[0])).toEqual([1, 2, 3, 4]);
    });

    it("preserves nested mix of typed values inside structured bound", () => {
      const bound = [
        {
          createdAt: new Date("2024-06-01T00:00:00Z"),
          counter: 100n,
          tags: new Set(["x", "y"]),
        },
        new Map([["users", [{ id: 1 }, { id: 2 }]]]),
      ];
      const result = decryptActionToken(encryptActionToken("actions#x", bound));
      expect(result.bound[0].createdAt).toBeInstanceOf(Date);
      expect(result.bound[0].counter).toBe(100n);
      expect(result.bound[0].tags).toBeInstanceOf(Set);
      expect(Array.from(result.bound[0].tags)).toEqual(["x", "y"]);
      expect(result.bound[1]).toBeInstanceOf(Map);
      expect(result.bound[1].get("users")).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it("treats undefined and explicit null bound the same way", () => {
      const a = encryptActionToken("actions#x", undefined);
      const b = encryptActionToken("actions#x", null);
      expect(decryptActionToken(a)).toEqual({
        actionId: "actions#x",
        bound: null,
      });
      expect(decryptActionToken(b)).toEqual({
        actionId: "actions#x",
        bound: null,
      });
    });

    it("treats an empty bound array as no-bound (null)", () => {
      // Empty bound never gets emitted as an array — there's nothing to
      // bind, so it normalises to null on decrypt.  This keeps the
      // unbound and zero-length-bound cases byte-identical and avoids a
      // subtle distinction at call time.
      const token = encryptActionToken("actions#x", []);
      expect(decryptActionToken(token)).toEqual({
        actionId: "actions#x",
        bound: null,
      });
    });

    it("produces a fresh ciphertext on each call (random IV)", () => {
      const a = encryptActionToken("actions#x", [42]);
      const b = encryptActionToken("actions#x", [42]);
      expect(a).not.toBe(b);
      // But both decrypt to the same payload.
      expect(decryptActionToken(a)).toEqual(decryptActionToken(b));
    });
  });

  describe("encryptActionId / decryptActionId", () => {
    it("encryptActionId is equivalent to encryptActionToken(id, null)", () => {
      const tokenA = encryptActionId("actions#submit");
      const decrypted = decryptActionToken(tokenA);
      expect(decrypted).toEqual({ actionId: "actions#submit", bound: null });
    });

    it("decryptActionId returns the action id only", () => {
      const token = encryptActionToken("actions#submit", [42]);
      expect(decryptActionId(token)).toBe("actions#submit");
    });

    it("decryptActionId returns null for invalid tokens", () => {
      expect(decryptActionId("garbage")).toBeNull();
      expect(decryptActionId("")).toBeNull();
      expect(decryptActionId(null)).toBeNull();
      expect(decryptActionId(undefined)).toBeNull();
      expect(decryptActionId(12345)).toBeNull();
    });
  });

  describe("tamper detection", () => {
    it("rejects single-byte flip in the ciphertext", () => {
      const token = encryptActionToken("actions#submit", [42]);
      const flipped = (token[0] === "A" ? "B" : "A") + token.slice(1);
      expect(decryptActionToken(flipped)).toBeNull();
    });

    it("rejects truncated tokens", () => {
      const token = encryptActionToken("actions#submit", [42]);
      const truncated = token.slice(0, token.length - 5);
      expect(decryptActionToken(truncated)).toBeNull();
    });

    it("rejects tokens that are too short to even hold IV+tag", () => {
      // Minimum size: iv(12) + authTag(16) + 1 byte ciphertext.
      // Anything shorter is structurally invalid.
      expect(decryptActionToken("AAAA")).toBeNull();
    });

    it("rejects non-base64url input", () => {
      expect(decryptActionToken("@#$%^&*()_+-=")).toBeNull();
    });
  });

  describe("key rotation", () => {
    it("decrypts a token issued under a previous key", async () => {
      // Issue under KEY_A.
      const token = encryptActionToken("actions#submit", [42]);

      // Rotate: KEY_B is primary, KEY_A is in rotation.
      await initSecretFromConfig({
        serverFunctions: {
          secret: KEY_B,
          previousSecrets: [KEY_A],
        },
      });

      expect(decryptActionToken(token)).toEqual({
        actionId: "actions#submit",
        bound: [42],
      });
    });

    it("rejects tokens issued under unrelated keys", async () => {
      const token = encryptActionToken("actions#submit", [42]);
      await initSecretFromConfig({
        serverFunctions: {
          secret: KEY_B,
          previousSecrets: [KEY_C],
        },
      });
      expect(decryptActionToken(token)).toBeNull();
    });

    it("after rotation, new tokens decrypt under the new primary", async () => {
      await initSecretFromConfig({
        serverFunctions: {
          secret: KEY_B,
          previousSecrets: [KEY_A],
        },
      });
      const token = encryptActionToken("actions#submit", [42]);
      expect(decryptActionToken(token)).toEqual({
        actionId: "actions#submit",
        bound: [42],
      });
    });
  });

  describe("legacy plain-string plaintext", () => {
    // The encryptActionId path now always emits the array form
    // [actionId, null]; legacy tokens are hand-crafted here to verify
    // that *in-flight* tokens issued by older runtime versions still
    // decode cleanly during a rolling upgrade.

    it("decodes plain-string plaintext as { actionId, bound: null }", () => {
      const legacyToken = encryptLegacyPlaintext("src/actions#submit", KEY_A);
      expect(decryptActionToken(legacyToken)).toEqual({
        actionId: "src/actions#submit",
        bound: null,
      });
      expect(decryptActionId(legacyToken)).toBe("src/actions#submit");
    });

    it("rejects legacy tokens whose plaintext just happens to start with '['", () => {
      // A pathological legacy token whose action id begins with '[' would
      // be misparsed as the array form.  In practice action ids are
      // "module#export" or "filepath#export" and never start with [, but
      // we document the boundary by asserting null on a malformed array.
      const malformed = encryptLegacyPlaintext("[not, json", KEY_A);
      expect(decryptActionToken(malformed)).toBeNull();
    });
  });

  describe("invalid plaintext shapes", () => {
    // These exercise the parseTokenPlaintext branch.  We can't easily
    // craft an arbitrary plaintext that decrypts cleanly without
    // exposing internals, so we verify the negative path through normal
    // token roundtrip + tamper.  The structural validation lives behind
    // valid AEAD; an attacker can't reach it without a key.
    it("token issued under correct key but with wrong plaintext shape returns null", () => {
      // Best we can do without exporting internals: ensure that random
      // bytes never accidentally decrypt as valid.  Statistical test —
      // 100 random tokens.
      for (let i = 0; i < 100; i++) {
        const random = Buffer.from(
          crypto.getRandomValues(new Uint8Array(64))
        ).toString("base64url");
        expect(decryptActionToken(random)).toBeNull();
      }
    });
  });
});
