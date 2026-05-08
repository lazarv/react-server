import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
} from "node:crypto";
import { readFile } from "node:fs/promises";

import { syncToBuffer } from "@lazarv/rsc/server";
import { syncFromBuffer } from "@lazarv/rsc/client";

let resolvedKey = null;
let previousKeys = [];

/**
 * Derive a 32-byte AES key from an arbitrary secret.
 * Accepts hex strings, base64url strings, or raw bytes.
 */
function deriveKey(secret) {
  if (Buffer.isBuffer(secret)) {
    return secret.length === 32
      ? secret
      : createHash("sha256").update(secret).digest();
  }
  if (typeof secret === "string") {
    // Try hex (64-char string = 32 bytes)
    if (/^[0-9a-fA-F]{64}$/.test(secret)) {
      return Buffer.from(secret, "hex");
    }
    // Otherwise hash the raw string to get a consistent 32-byte key
    return createHash("sha256").update(secret, "utf8").digest();
  }
  throw new Error("Invalid secret: expected a string or Buffer");
}

/**
 * Load the secret from a .pem file (async).
 * Reads the file and hashes its contents to a 32-byte key.
 */
async function loadSecretFile(filePath) {
  const contents = await readFile(filePath);
  return createHash("sha256").update(contents).digest();
}

/**
 * Initialise the encryption key from configuration, env vars, or .pem files.
 *
 * Must be called **once** at server startup (not per-render). Resolution order:
 *
 * 1. `REACT_SERVER_FUNCTIONS_SECRET` environment variable
 * 2. `REACT_SERVER_FUNCTIONS_SECRET_FILE` env var (path to .pem)
 * 3. `serverFunctions.secret` in react-server config
 * 4. `serverFunctions.secretFile` in react-server config (path to .pem)
 * 5. Fallback: generate a random ephemeral key (dev mode)
 *
 * In production the build artifact is loaded separately via `initSecret()`
 * before this function is called, so steps 1–4 act as overrides.
 *
 * @param {object} [config] - The react-server user config object (optional)
 */
export async function initSecretFromConfig(config) {
  // Env vars and config deliberately override a key that was already set
  // via initSecret() (e.g. from a build artifact) so that operators can
  // rotate secrets without rebuilding.
  let secretSet = false;

  // 1. Env var — direct secret
  const envSecret =
    typeof process !== "undefined"
      ? process.env?.REACT_SERVER_FUNCTIONS_SECRET
      : undefined;
  if (envSecret) {
    resolvedKey = deriveKey(envSecret);
    globalThis.__react_server_action_key__ = resolvedKey;
    secretSet = true;
  }

  // 2. Env var — secret file
  if (!secretSet) {
    const envFile =
      typeof process !== "undefined"
        ? process.env?.REACT_SERVER_FUNCTIONS_SECRET_FILE
        : undefined;
    if (envFile) {
      resolvedKey = await loadSecretFile(envFile);
      globalThis.__react_server_action_key__ = resolvedKey;
      secretSet = true;
    }
  }

  // 3. Config — direct secret
  if (!secretSet) {
    const configSecret = config?.serverFunctions?.secret;
    if (configSecret) {
      resolvedKey = deriveKey(configSecret);
      globalThis.__react_server_action_key__ = resolvedKey;
      secretSet = true;
    }
  }

  // 4. Config — secret file
  if (!secretSet) {
    const configFile = config?.serverFunctions?.secretFile;
    if (configFile) {
      resolvedKey = await loadSecretFile(configFile);
      globalThis.__react_server_action_key__ = resolvedKey;
      secretSet = true;
    }
  }

  // No user-provided secret found — leave resolvedKey as-is.
  // In dev mode getKey() will lazily generate an ephemeral key.

  // --- Previous keys for rotation ---
  const prevSecrets = config?.serverFunctions?.previousSecrets;
  const prevFiles = config?.serverFunctions?.previousSecretFiles;
  const prev = [];
  if (Array.isArray(prevSecrets)) {
    for (const s of prevSecrets) {
      if (s) prev.push(deriveKey(s));
    }
  }
  if (Array.isArray(prevFiles)) {
    for (const f of prevFiles) {
      if (f) prev.push(await loadSecretFile(f));
    }
  }
  if (prev.length > 0) {
    previousKeys = prev;
    globalThis.__react_server_action_previous_keys__ = previousKeys;
  }
}

/**
 * Initialise the secret from an externally-provided value.
 * Called at build time (with a generated secret) and at production startup
 * (with the build artifact).  Always sets the key — callers that need to
 * override (env var, config) should call initSecretFromConfig() afterwards.
 *
 * The key is also stored on `globalThis` so that separate module instances
 * of this file (e.g. Vite plugin vs. Vite SSR module graph in dev mode)
 * can converge on the same encryption key.
 *
 * @param {string | Buffer} secret
 */
export function initSecret(secret) {
  resolvedKey = deriveKey(secret);
  globalThis.__react_server_action_key__ = resolvedKey;
}

/**
 * Generate a random 32-byte secret (hex-encoded).
 * Used at build time to produce a persistent key.
 *
 * @returns {string} 64-char hex string
 */
export function generateSecret() {
  return randomBytes(32).toString("hex");
}

/**
 * Return the current key.
 *
 * Checks `globalThis.__react_server_action_key__` first so that a key
 * initialised in one module instance (e.g. the Vite plugin) is visible to
 * other instances of this file loaded through a different module graph
 * (e.g. Vite's SSR / RSC module system in dev mode).
 *
 * Falls back to generating a random ephemeral key for edge cases (tests).
 */
function getKey() {
  if (!resolvedKey && globalThis.__react_server_action_key__) {
    resolvedKey = globalThis.__react_server_action_key__;
  }
  if (!resolvedKey) {
    // Fallback for edge cases where init was skipped (e.g. tests).
    resolvedKey = randomBytes(32);
    globalThis.__react_server_action_key__ = resolvedKey;
  }
  // Sync previous keys from globalThis (cross-instance).
  if (
    previousKeys.length === 0 &&
    globalThis.__react_server_action_previous_keys__?.length > 0
  ) {
    previousKeys = globalThis.__react_server_action_previous_keys__;
  }
  return resolvedKey;
}

/**
 * Return the list of previous keys for rotation.
 */
function getPreviousKeys() {
  getKey(); // ensure synced from globalThis
  return previousKeys;
}

/**
 * Encrypt an action token (id + optional bound capture array) using AES-256-GCM
 * with a random IV.
 *
 * Bound captures travel inside the encrypted blob using `@lazarv/rsc`'s
 * `syncToBuffer` — the same wire format `decodeReply` speaks — so typed
 * values (`Date`, `BigInt`, `Map`, `Set`, `RegExp`, `URL`, `URLSearchParams`,
 * typed arrays, …) survive the round-trip with full fidelity.  A naive
 * `JSON.stringify` on `bound` would silently lose those types.
 *
 * Bundling `(actionId, boundBytes)` into a single AEAD-protected token gives
 * us tamper-evident bound captures for free: the same primitive that binds
 * action identity also binds the captured arguments.  Bound values never
 * travel plaintext on the wire, and a malicious client cannot edit them
 * without invalidating the auth tag.
 *
 * Each call produces a unique ciphertext (random IV), so every render emits
 * fresh tokens even for the same `(actionId, bound)` pair.
 *
 * Plaintext layout (post-decrypt):
 *
 *   `[actionId, boundBytesAsBase64 | null]`
 *
 * - `null` → unbound action.
 * - base64 string → decode to bytes, then `syncFromBuffer` to recover the
 *   typed bound array.
 *
 * @param {string} actionId - The original action ID (e.g. "src/actions#submit")
 * @param {Array<unknown> | null | undefined} [bound] - Captured bound args, or null/undefined for unbound
 * @returns {string} base64url-encoded encrypted token
 */
export function encryptActionToken(actionId, bound) {
  const key = getKey();
  const iv = randomBytes(12);

  // Serialize the bound array via @lazarv/rsc's sync flight encoder so
  // typed values survive the round-trip.  Returns null when the action
  // has no bound captures (or an empty array — same wire result either way).
  let boundEncoded = null;
  if (Array.isArray(bound) && bound.length > 0) {
    const buffer = syncToBuffer(bound);
    boundEncoded = Buffer.from(buffer).toString("base64");
  }

  // Plaintext is JSON [actionId, base64Bytes | null].  Array (not object)
  // form keeps the shape stable and avoids JSON-key-ordering ambiguity.
  const plaintext = JSON.stringify([actionId, boundEncoded]);

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Format: iv(12) + authTag(16) + ciphertext
  return Buffer.concat([iv, authTag, encrypted]).toString("base64url");
}

/**
 * Encrypt a server function ID (no bound captures).  Thin wrapper over
 * `encryptActionToken(actionId, null)` kept for callers that don't carry
 * bound state.  Emits the same array-form plaintext, so a token produced
 * here decrypts cleanly via either `decryptActionId` or `decryptActionToken`.
 *
 * @param {string} actionId
 * @returns {string} base64url-encoded encrypted token
 */
export function encryptActionId(actionId) {
  return encryptActionToken(actionId, null);
}

/**
 * Try to decrypt a token with a specific key.
 *
 * @param {string} token - base64url-encoded encrypted token
 * @param {Buffer} key - 32-byte AES key
 * @returns {string | null} The decrypted plaintext, or null on failure
 */
function tryDecryptWithKey(token, key) {
  try {
    const data = Buffer.from(token, "base64url");

    // Minimum size: iv(12) + authTag(16) + at least 1 byte ciphertext
    if (data.length < 29) return null;

    const iv = data.subarray(0, 12);
    const authTag = data.subarray(12, 28);
    const ciphertext = data.subarray(28);

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Parse a decrypted plaintext back into `{ actionId, bound }`.
 *
 * Handles two formats:
 *
 *   - **New (array)**: `[actionId, boundBase64 | null]` — emitted by every
 *     token issued since type-preserving bound landed.  `boundBase64` is
 *     either `null` (unbound) or a base64-encoded `syncToBuffer` blob that
 *     decodes to the typed bound array via `syncFromBuffer`.
 *   - **Legacy (plain string)**: just the action id, no bound. Tokens that
 *     pre-date this change (e.g. still in flight from a pre-upgrade render)
 *     decrypt cleanly to `{ actionId, bound: null }`.
 *
 * Returns `null` on any structural inconsistency, including a base64 blob
 * that doesn't survive `syncFromBuffer` (corruption, version skew).
 *
 * @param {string} plaintext
 * @returns {{actionId: string, bound: Array<unknown> | null} | null}
 */
function parseTokenPlaintext(plaintext) {
  // Legacy: action id as a plain string. Any token that wasn't
  // JSON.stringified as an array starts with a non-bracket character.
  if (plaintext.length > 0 && plaintext[0] !== "[") {
    return { actionId: plaintext, bound: null };
  }
  let parsed;
  try {
    parsed = JSON.parse(plaintext);
  } catch {
    return null;
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 2 ||
    typeof parsed[0] !== "string"
  ) {
    return null;
  }
  const actionId = parsed[0];
  const boundEncoded = parsed[1];

  if (boundEncoded === null) {
    return { actionId, bound: null };
  }

  if (typeof boundEncoded !== "string") return null;

  // Decode the bound bytes via @lazarv/rsc's sync flight decoder. This
  // recovers typed values (Date, BigInt, Map, Set, RegExp, URL,
  // URLSearchParams, typed arrays, …) with full fidelity — the same
  // contract decodeReply gives us for client-supplied args.
  let bound;
  try {
    const bytes = Buffer.from(boundEncoded, "base64");
    bound = syncFromBuffer(bytes);
  } catch {
    return null;
  }
  if (!Array.isArray(bound)) return null;

  return { actionId, bound };
}

/**
 * Decrypt an action token back to its full `{ actionId, bound }` payload.
 *
 * Tries the primary key first, then any rotation keys.  Returns `null` if
 * decryption fails (wrong key, tampered ciphertext, malformed plaintext).
 *
 * @param {string} token - base64url-encoded encrypted token
 * @returns {{actionId: string, bound: Array<unknown> | null} | null}
 */
export function decryptActionToken(token) {
  if (!token || typeof token !== "string") return null;

  // Try primary key, then previous keys for rotation.
  const keysToTry = [getKey(), ...getPreviousKeys()];
  for (const k of keysToTry) {
    const plaintext = tryDecryptWithKey(token, k);
    if (plaintext !== null) {
      return parseTokenPlaintext(plaintext);
    }
  }
  return null;
}

/**
 * Decrypt an action token to just the action ID (drops any bound payload).
 *
 * Convenience for callers that only need the action identity — registry
 * lookups, logging, etc.  Returns `null` on failure.
 *
 * @param {string} token
 * @returns {string | null}
 */
export function decryptActionId(token) {
  const result = decryptActionToken(token);
  return result ? result.actionId : null;
}

/**
 * Wrap a server reference map (Proxy or static object) with a layer that
 * transparently handles encrypted action ID lookups.
 *
 * When a lookup key cannot be found directly, the wrapper attempts to decrypt
 * it and retries the lookup with the decrypted value.
 *
 * @param {object} baseMap - The original server reference map
 * @returns {Proxy} A wrapped map that supports encrypted key lookups
 */
export function wrapServerReferenceMap(baseMap) {
  return new Proxy(baseMap, {
    get(target, prop) {
      if (typeof prop === "symbol") return target[prop];

      // Standard action ID keys (contain "#") — delegate directly.
      if (typeof prop === "string" && prop.includes("#")) {
        return target[prop];
      }

      // server-action:// prefixed keys used for RSC serialization proxying
      if (typeof prop === "string" && prop.startsWith("server-action://")) {
        return target[prop];
      }

      // Attempt to decrypt (potential encrypted token).
      if (typeof prop === "string") {
        const decrypted = decryptActionId(prop);
        if (decrypted) {
          return target[decrypted];
        }
      }

      return undefined;
    },
  });
}
