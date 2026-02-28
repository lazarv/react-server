import { registerServerReference as _registerServerReference } from "react-server-dom-webpack/server.edge";
import { encryptActionId } from "./action-crypto.mjs";

/**
 * Wraps React's registerServerReference to replace the plain-text $$id with
 * an encrypting getter.  Each read of $$id returns a freshly encrypted
 * token (random IV) so every render produces unique, capability-protected
 * action identifiers that hide the real filesystem paths from the client.
 */
export function registerServerReference(fn, id, name) {
  // Let React set up $$typeof, $$id, $$bound, bind, etc.
  _registerServerReference(fn, id, name);

  // Capture the original plain-text ID that React just set
  const originalId = fn.$$id;

  // Replace $$id with a getter that returns the encrypted token.
  // React's registerServerReference sets configurable: true, so
  // re-defining is safe.
  Object.defineProperty(fn, "$$id", {
    get() {
      return encryptActionId(originalId);
    },
    enumerable: true,
    configurable: true,
  });

  return fn;
}
