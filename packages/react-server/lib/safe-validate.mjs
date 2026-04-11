/**
 * Validate data against a schema, supporting multiple schema libraries.
 *
 * Tries strategies in order:
 * 1. `.safeParse(data)` — Zod, Valibot, and compatible libraries
 * 2. `.assert(data)` — ArkType (throws on failure, returns T on success)
 * 3. `.parse(data)` — generic fallback (throws on failure)
 *
 * @param {object} schema - A schema object with `.safeParse()`, `.assert()`, or `.parse()`
 * @param {unknown} data - Raw data to validate
 * @param {unknown} fallback - Value to return when validation fails
 * @returns {{ success: true, data: unknown } | { success: false, fallback: unknown }}
 */
export function safeValidate(schema, data, fallback) {
  // Zod / Valibot style
  if (typeof schema.safeParse === "function") {
    const result = schema.safeParse(data);
    if (result.success) return { success: true, data: result.data };
    return { success: false, fallback };
  }

  // ArkType style — .assert() throws on failure, returns T on success
  if (typeof schema.assert === "function") {
    try {
      return { success: true, data: schema.assert(data) };
    } catch {
      return { success: false, fallback };
    }
  }

  // Generic .parse() — throws on failure
  if (typeof schema.parse === "function") {
    try {
      return { success: true, data: schema.parse(data) };
    } catch {
      return { success: false, fallback };
    }
  }

  // Schema has no recognised validation method — pass data through
  return { success: true, data };
}
