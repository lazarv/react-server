/**
 * Companion server-actions module for the CSRF spec.
 *
 * Why this module exists: the runtime auto-disables server functions
 * in production when the server-reference manifest is empty (see
 * `serverFunctionsEnabled` in render-rsc.jsx). With no real
 * `"use server"` export anywhere in the fixture, an action-shaped
 * POST never enters the action-dispatch block — so the CSRF check
 * (which lives inside that block) never fires. Importing this
 * module from `csrf-action.jsx` is enough to seed the manifest
 * with one entry, which is all the runtime checks.
 */
"use server";

export async function noop() {
  return null;
}
