import { registerServerReference as _registerServerReference } from "react-server-dom-webpack/server.edge";
import { encryptActionId } from "./action-crypto.mjs";

/**
 * Wraps React's registerServerReference to replace the plain-text $$id with
 * an encrypting getter.  The encrypted token is cached on the function
 * instance so that every read of $$id within the same lifecycle returns the
 * same value.  This is required because React's decodeFormState compares the
 * action ID from the submitted form with the current $$id — if they differ
 * (e.g. due to a fresh random IV on each read), useActionState cannot match
 * the form state back to the component.
 */
export function registerServerReference(fn, id, name) {
  // Let React set up $$typeof, $$id, $$bound, bind, etc.
  _registerServerReference(fn, id, name);

  // Capture the original plain-text ID that React just set
  const originalId = fn.$$id;

  // Store the original plain-text ID as a non-enumerable property so that
  // server-side code (e.g. useActionState) can compare action identities
  // without needing to decrypt.  Non-enumerable keeps it out of
  // serialisation payloads sent to the client.
  Object.defineProperty(fn, "$$originalId", {
    value: originalId,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  // Replace $$id with a getter that lazily encrypts once and caches the
  // result.  The token is still unique per function instance (random IV on
  // first read) but stable across subsequent reads of the same reference.
  let cachedEncryptedId = null;
  Object.defineProperty(fn, "$$id", {
    get() {
      if (!cachedEncryptedId) {
        cachedEncryptedId = encryptActionId(originalId);
      }
      return cachedEncryptedId;
    },
    enumerable: true,
    configurable: true,
  });

  return fn;
}
