/**
 * Resource key validation and parsing.
 *
 * Supports two strategies (same as route params):
 * 1. Schema validation — Zod, ArkType, Valibot (via safeValidate)
 * 2. Lightweight parse — plain object of coercion functions (via applyParsers)
 *
 * @module
 */

import { safeValidate } from "./safe-validate.mjs";
import { applyParsers } from "./apply-parsers.mjs";

/**
 * Determine whether a key schema is a validation schema (has .safeParse, .assert, or .parse)
 * or a lightweight parse map (plain object of coercion functions).
 */
function isValidationSchema(schema) {
  return (
    typeof schema.safeParse === "function" ||
    typeof schema.assert === "function" ||
    typeof schema.parse === "function"
  );
}

/**
 * Validate and/or coerce a raw resource key against the resource's key schema.
 *
 * @param {object|null} keySchema - Schema or parse map from the resource descriptor
 * @param {unknown} rawKey - Raw key value from the caller
 * @returns {unknown} Validated/coerced key, or rawKey if no schema
 */
export function validateResourceKey(keySchema, rawKey) {
  if (!keySchema) return rawKey;

  if (isValidationSchema(keySchema)) {
    const result = safeValidate(keySchema, rawKey, rawKey);
    return result.success ? result.data : result.fallback;
  }

  // Lightweight parse — { id: Number } style
  return applyParsers(rawKey, keySchema);
}
