/**
 * Cross-Site Request Forgery defence for server-function action POSTs.
 *
 * The threat: a malicious site can submit a `<form action="https://victim/">`
 * cross-origin POST that triggers a server function. The browser
 * does not preflight `multipart/form-data` requests (CORS-simple),
 * so the action handler runs unless something checks the request's
 * origin.
 *
 * JS-driven action calls (with the custom `react-server-action`
 * header) ARE preflighted by the browser — adding any custom header
 * makes a request not CORS-simple, forcing the browser to preflight,
 * which our server refuses unless the operator explicitly enables
 * CORS for that path. So this module only defends the form-submit
 * shape (multipart/form-data with a `$ACTION_ID_<token>` field).
 *
 * Trusted-origin set, in priority order:
 *
 *   1. The request's own resolved origin (so same-origin form posts
 *      work out of the box without any config). Resolved via the
 *      runtime's existing trust-proxy logic in `createMiddleware` —
 *      `context.request.url` is already the canonical, proxy-aware
 *      origin of the receiving app.
 *   2. `config.server.origin` — the canonical configured identity.
 *      Redundant with (1) when the configured origin matches the
 *      request, but matters for deployments where the app is
 *      reachable at multiple URLs (Docker hostname vs. public URL).
 *   3. `config.server.cors.origin` / `origins` if configured with
 *      explicit values (not `*` / `true`). Apps that have explicit
 *      CORS allow-lists usually want the same set to count as
 *      CSRF-trusted — the operator has already declared that those
 *      origins are integration partners.
 *   4. `config.server.csrf.allowedOrigins` — explicit additions for
 *      cases where the operator wants CSRF-trusted origins to differ
 *      from the CORS set (e.g., remote-component hosts that may not
 *      need cross-origin fetch but DO submit forms to this app).
 *
 * Remote components: when a host app embeds remote components, the
 * remote operator MUST add the host's origin to
 * `server.csrf.allowedOrigins` (or to CORS, via reuse) — otherwise
 * legitimate form-submit POSTs from embedded forms get rejected.
 * This is by design: the remote operator explicitly declares which
 * host origins may invoke their action endpoints.
 *
 * @module
 */

/**
 * Resolve the request's origin for CSRF validation.  Uses the
 * `Origin` header first (set by browsers on all cross-origin
 * requests and most same-origin POSTs), falls back to parsing the
 * origin out of `Referer`.  Returns `null` when neither is usable.
 *
 * Treats `"null"` (opaque origin, sandboxed iframe, file://, etc.)
 * as "Origin present and untrusted" — return the literal `"null"`
 * so the caller can distinguish absent-vs-opaque.
 *
 * @param {Request} request
 * @returns {string | null}
 */
export function getRequestOrigin(request) {
  const origin = request.headers.get("origin");
  if (origin) return origin;
  const referer = request.headers.get("referer");
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

/**
 * Build the set of trusted origins for the current request.
 * Returns a `{ literals: Set<string>, patterns: RegExp[] }` pair
 * — the literals are O(1) lookups, the patterns are matched
 * sequentially for `RegExp` entries in `allowedOrigins`.
 *
 * @param {Request} request - so the request's own origin is in the
 *   trusted set (same-origin posts work without config)
 * @param {object} config
 * @returns {{ literals: Set<string>, patterns: RegExp[] }}
 */
export function resolveTrustedOrigins(request, config) {
  const literals = new Set();
  const patterns = [];

  // 1. The request's own origin — same-origin form POSTs always work.
  //    `context.request.url` was built in createMiddleware using the
  //    trust-proxy-aware protocol and host, so this is the canonical
  //    proxy-resolved origin of the receiving app.
  try {
    literals.add(new URL(request.url).origin);
  } catch {
    // Malformed URL — leave the literals empty; downstream check fails.
  }

  // 2. Explicitly configured origin (canonical identity).
  if (typeof config?.server?.origin === "string") {
    try {
      literals.add(new URL(config.server.origin).origin);
    } catch {
      // ignore malformed config
    }
  }

  // 3. CORS allowed origins, when they're explicit (not wildcard).
  const corsOrigin =
    config?.server?.cors?.origin ?? config?.server?.cors?.origins;
  collectCorsOrigins(corsOrigin, literals, patterns);

  // 4. CSRF-specific allow-list.
  const csrfAllowed = config?.server?.csrf?.allowedOrigins;
  if (Array.isArray(csrfAllowed)) {
    for (const entry of csrfAllowed) {
      if (typeof entry === "string") {
        try {
          literals.add(new URL(entry).origin);
        } catch {
          // ignore malformed entry
        }
      } else if (entry instanceof RegExp) {
        patterns.push(entry);
      }
    }
  }

  return { literals, patterns };
}

function collectCorsOrigins(corsOrigin, literals, patterns) {
  if (corsOrigin == null || corsOrigin === true || corsOrigin === "*") return;
  const list = Array.isArray(corsOrigin) ? corsOrigin : [corsOrigin];
  for (const entry of list) {
    if (typeof entry === "string" && entry !== "*") {
      try {
        literals.add(new URL(entry).origin);
      } catch {
        // ignore malformed
      }
    } else if (entry instanceof RegExp) {
      patterns.push(entry);
    }
  }
}

/**
 * Check whether `origin` is in the trusted set.
 *
 * @param {string | null} origin
 * @param {{ literals: Set<string>, patterns: RegExp[] }} trusted
 * @returns {boolean}
 */
export function isOriginTrusted(origin, trusted) {
  if (typeof origin !== "string" || origin === "" || origin === "null") {
    return false;
  }
  if (trusted.literals.has(origin)) return true;
  for (const re of trusted.patterns) {
    if (re.test(origin)) return true;
  }
  return false;
}

/**
 * Decide whether a form-submit action POST passes CSRF validation.
 *
 * Behaviour by `config.server.csrf.mode`:
 *
 *   - `false`              → always allow (CSRF defence disabled)
 *   - `"lax"` (default)    → allow when Origin/Referer is missing
 *                            (server-to-server, curl, native apps);
 *                            require trust when Origin is present
 *   - `"strict"`           → always require trust; reject if Origin
 *                            is missing
 *
 * @param {Request} request
 * @param {object} config
 * @returns {{ ok: true } | { ok: false, reason: "csrf_origin_mismatch" | "csrf_origin_missing", origin: string | null }}
 */
export function checkCsrf(request, config) {
  const csrfConfig = config?.server?.csrf;
  if (csrfConfig === false) return { ok: true };

  const mode = csrfConfig?.mode ?? "lax";
  if (mode === false || mode === "off") return { ok: true };

  const origin = getRequestOrigin(request);
  if (origin == null) {
    if (mode === "strict") {
      return { ok: false, reason: "csrf_origin_missing", origin: null };
    }
    return { ok: true };
  }

  const trusted = resolveTrustedOrigins(request, config);
  if (isOriginTrusted(origin, trusted)) return { ok: true };
  return { ok: false, reason: "csrf_origin_mismatch", origin };
}
