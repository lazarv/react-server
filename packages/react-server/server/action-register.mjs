import { registerServerReference as _registerServerReference } from "@lazarv/rsc/server";
import { encryptActionId } from "./action-crypto.mjs";

const REACT_SERVER_REFERENCE = Symbol.for("react.server.reference");

/**
 * Custom bind for server references that preserves $$typeof, $$id, $$bound,
 * and the encrypting $$id getter on bound functions.
 */
function createServerRefBind(fullId) {
  return function serverRefBind(thisArg, ...boundArgs) {
    const original = this;
    const previousBound = original.$$bound || [];
    const accumulated = previousBound.concat(boundArgs);

    const boundFn = Function.prototype.bind.call(original, thisArg, ...boundArgs);

    Object.defineProperty(boundFn, "$$typeof", {
      value: REACT_SERVER_REFERENCE,
      writable: false,
      enumerable: true,
      configurable: true,
    });
    Object.defineProperty(boundFn, "$$bound", {
      value: accumulated,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    Object.defineProperty(boundFn, "$$originalId", {
      value: fullId,
      enumerable: false,
      configurable: false,
      writable: false,
    });

    // Each bound instance gets its own cached encrypted ID
    let cachedEncryptedId = null;
    Object.defineProperty(boundFn, "$$id", {
      get() {
        if (!cachedEncryptedId) {
          cachedEncryptedId = encryptActionId(fullId);
        }
        return cachedEncryptedId;
      },
      enumerable: true,
      configurable: true,
    });

    boundFn.bind = createServerRefBind(fullId);
    return boundFn;
  };
}

/**
 * Wraps @lazarv/rsc's registerServerReference to:
 * 1. Register the action in the internal server reference registry
 * 2. Set $$typeof / $$id / $$bound on the *original* function (fn) so that
 *    callers who already hold a reference to fn see the metadata
 * 3. Replace $$id with an encrypting getter that caches per-instance
 * 4. Override bind() to propagate server reference metadata
 *
 * The encrypted token is cached so that every read of $$id within the same
 * lifecycle returns the same value.  This is required because React's
 * decodeFormState compares the action ID from the submitted form with the
 * current $$id — if they differ (e.g. due to a fresh random IV on each
 * read), useActionState cannot match the form state back to the component.
 */
export function registerServerReference(fn, id, name) {
  const fullId = `${id}#${name}`;

  // Register in @lazarv/rsc's internal serverReferenceRegistry so that
  // decodeAction / lookupServerReference can find it.
  _registerServerReference(fn, id, name);

  // Set server reference metadata directly on the original fn, because
  // the generated code uses fn by reference (the return value is ignored).
  Object.defineProperty(fn, "$$typeof", {
    value: REACT_SERVER_REFERENCE,
    writable: false,
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(fn, "$$bound", {
    value: null,
    writable: true,
    enumerable: true,
    configurable: true,
  });

  // Store the original plain-text ID as a non-enumerable property so that
  // server-side code (e.g. useActionState) can compare action identities
  // without needing to decrypt.  Non-enumerable keeps it out of
  // serialisation payloads sent to the client.
  Object.defineProperty(fn, "$$originalId", {
    value: fullId,
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
        cachedEncryptedId = encryptActionId(fullId);
      }
      return cachedEncryptedId;
    },
    enumerable: true,
    configurable: true,
  });

  // Override bind to preserve server reference metadata on bound functions.
  fn.bind = createServerRefBind(fullId);

  return fn;
}
