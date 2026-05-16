/**
 * Fixture for the CSRF integration spec.
 *
 * The spec sends raw multipart POSTs that LOOK like form-submit
 * action requests (`$ACTION_ID_<token>` field). The CSRF check
 * fires BEFORE any token decryption, so the test doesn't need a
 * valid token — it just needs the request to be action-shaped so
 * the runtime enters the action-dispatch block.
 *
 * - CSRF fails → HTTP 403 with `x-react-server-action-error`
 * - CSRF passes → runtime proceeds to action lookup, hits
 *   "unknown action" path (since the token is garbage), returns
 *   the rendered page with an error context. We assert on the
 *   absence of 403, not on a specific success body.
 *
 * The companion `csrf-actions.mjs` import is required: in
 * production the runtime auto-disables server functions when the
 * server-reference manifest is empty, which would short-circuit
 * past the action-dispatch block (and therefore past the CSRF
 * check) for action-shaped POSTs. Pulling in one real
 * `"use server"` export keeps the manifest non-empty so the
 * dispatch block runs and the CSRF check fires.
 */
import "./csrf-actions.mjs";

export default function CsrfActionPage() {
  return <p data-testid="page">csrf-fixture</p>;
}
