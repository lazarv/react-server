import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
} from "node:crypto";
import { readFile } from "node:fs/promises";

let resolvedKey = null;

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
 * 1. `REACT_SERVER_ACTIONS_SECRET` environment variable
 * 2. `REACT_SERVER_ACTIONS_SECRET_FILE` env var (path to .pem)
 * 3. `serverActions.secret` in react-server config
 * 4. `serverActions.secretFile` in react-server config (path to .pem)
 * 5. Fallback: generate a random ephemeral key (dev mode)
 *
 * In production the build artifact is loaded separately via `initSecret()`
 * before this function is called, so steps 1–4 act as overrides.
 *
 * @param {object} [config] - The react-server user config object (optional)
 */
export async function initSecretFromConfig(config) {
  // NOTE: no early return — env vars and config deliberately override a
  // key that was already set via initSecret() (e.g. from a build artifact)
  // so that operators can rotate secrets without rebuilding.

  // 1. Env var — direct secret
  const envSecret =
    typeof process !== "undefined"
      ? process.env?.REACT_SERVER_ACTIONS_SECRET
      : undefined;
  if (envSecret) {
    resolvedKey = deriveKey(envSecret);
    globalThis.__react_server_action_key__ = resolvedKey;
    return;
  }

  // 2. Env var — secret file
  const envFile =
    typeof process !== "undefined"
      ? process.env?.REACT_SERVER_ACTIONS_SECRET_FILE
      : undefined;
  if (envFile) {
    resolvedKey = await loadSecretFile(envFile);
    globalThis.__react_server_action_key__ = resolvedKey;
    return;
  }

  // 3. Config — direct secret
  const configSecret = config?.serverActions?.secret;
  if (configSecret) {
    resolvedKey = deriveKey(configSecret);
    globalThis.__react_server_action_key__ = resolvedKey;
    return;
  }

  // 4. Config — secret file
  const configFile = config?.serverActions?.secretFile;
  if (configFile) {
    resolvedKey = await loadSecretFile(configFile);
    globalThis.__react_server_action_key__ = resolvedKey;
    return;
  }

  // No user-provided secret found — leave resolvedKey as-is.
  // In dev mode getKey() will lazily generate an ephemeral key.
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
  return resolvedKey;
}

/**
 * Encrypt a server action ID using AES-256-GCM with a random IV.
 *
 * Each call produces a unique token because the IV is randomly generated.
 * This means every render produces fresh, unique action tokens.
 *
 * @param {string} actionId - The original action ID (e.g. "src/actions#submitForm")
 * @returns {string} base64url-encoded encrypted token
 */
export function encryptActionId(actionId) {
  const key = getKey();
  const iv = randomBytes(12);

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(actionId, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Format: iv(12) + authTag(16) + ciphertext
  return Buffer.concat([iv, authTag, encrypted]).toString("base64url");
}

/**
 * Decrypt an encrypted action token back to the original action ID.
 *
 * @param {string} token - base64url-encoded encrypted token
 * @returns {string | null} The original action ID, or null if decryption fails
 */
export function decryptActionId(token) {
  try {
    if (!token || typeof token !== "string") return null;

    const key = getKey();
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
