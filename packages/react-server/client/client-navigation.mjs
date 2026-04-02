"use client";

import { useEffect } from "react";

// --- Navigation Guards ---

const navigationGuards = new Set();

/**
 * Register a navigation guard callback.
 * The guard is called before every client-side navigation with (from, to).
 *
 * Return values:
 * - true or undefined: allow navigation
 * - false: block navigation
 * - string: redirect to that URL instead
 *
 * @param {(from: string, to: string) => boolean | string | undefined | Promise<boolean | string | undefined>} guard
 * @returns {() => void} Unregister function
 */
export function registerNavigationGuard(guard) {
  navigationGuards.add(guard);
  return () => navigationGuards.delete(guard);
}

/**
 * Run all registered navigation guards.
 * Returns { allowed: true } or { allowed: false } or { allowed: false, redirect: string }.
 *
 * @param {string} from - Current pathname
 * @param {string} to - Target pathname
 * @returns {Promise<{ allowed: boolean, redirect?: string }>}
 */
export async function runNavigationGuards(from, to) {
  for (const guard of navigationGuards) {
    const result = await guard(from, to);
    if (result === false) {
      return { allowed: false };
    }
    if (typeof result === "string") {
      return { allowed: false, redirect: result };
    }
  }
  return { allowed: true };
}

/**
 * React hook to register a navigation guard for the lifetime of the component.
 *
 * The guard callback is called before every client-side navigation.
 * Return `false` to block navigation, a `string` to redirect, or `true`/`undefined` to allow.
 *
 * Use the `beforeUnload` option to also show the browser's native "Leave site?" dialog
 * when the user tries to close the tab or navigate away externally. Pass a reactive boolean
 * so the listener is only active when needed (e.g. when a form is dirty).
 *
 * For pattern matching, use `useMatch()` inside the guard handler rather than a pattern parameter,
 * which is more composable.
 *
 * @param {(from: string, to: string) => boolean | string | undefined | Promise<boolean | string | undefined>} guard
 * @param {{ beforeUnload?: boolean }} [options]
 *
 * @example
 * ```jsx
 * // Leave guard — block navigation when form is dirty
 * const [dirty, setDirty] = useState(false);
 *
 * useNavigationGuard(
 *   (from, to) => {
 *     if (dirty) return confirm("You have unsaved changes. Leave?");
 *   },
 *   { beforeUnload: dirty }
 * );
 * ```
 *
 * @example
 * ```jsx
 * // Enter guard — redirect unauthenticated users
 * useNavigationGuard((from, to) => {
 *   if (!isAuthenticated && to.startsWith("/dashboard")) {
 *     return "/login";
 *   }
 * });
 * ```
 */
export function useNavigationGuard(guard, options = {}) {
  const { beforeUnload = false } = options;

  useEffect(() => {
    const unregister = registerNavigationGuard(guard);

    let handleBeforeUnload;
    if (beforeUnload) {
      handleBeforeUnload = (event) => {
        event.preventDefault();
      };
      window.addEventListener("beforeunload", handleBeforeUnload);
    }

    return () => {
      unregister();
      if (handleBeforeUnload) {
        window.removeEventListener("beforeunload", handleBeforeUnload);
      }
    };
  }, [guard, beforeUnload]);
}

// --- Client-side redirect ---

/**
 * Error class thrown by client-side redirect().
 * Caught by RedirectBoundary which uses the proper navigation system.
 */
export class RedirectError extends Error {
  constructor(url, { replace = true } = {}) {
    super(`Redirect: ${url}`);
    this.url = url;
    this.replace = replace;
    this.name = "RedirectError";
  }
}

/**
 * Perform a client-side redirect by throwing a RedirectError.
 * Must be called during render inside a component wrapped by a Route
 * (which includes a RedirectBoundary).
 *
 * The RedirectBoundary catches the error and uses the full navigation
 * system (useClient().navigate) to perform the redirect, supporting
 * both client-only and server routes.
 *
 * @param {string} url - The URL to redirect to
 * @param {{ replace?: boolean }} [options] - Options. replace defaults to true.
 * @throws {RedirectError}
 *
 * @example
 * ```jsx
 * "use client";
 * import { redirect } from "@lazarv/react-server/navigation";
 *
 * export default function ProtectedPage() {
 *   if (!isAuthenticated) {
 *     redirect("/login");
 *   }
 *   return <div>Secret content</div>;
 * }
 * ```
 */
export function redirect(url, options) {
  throw new RedirectError(url, options);
}
