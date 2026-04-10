/**
 * Regression test for scope leaking between sibling functions.
 *
 * The bug: the plugin used a flat `locals` array for closure capture tracking.
 * Variables declared inside `prepareResult` (a non-cached sibling function)
 * leaked into the capture list for `getCachedResult` (a module-level exported
 * cached function). The plugin then emitted:
 *
 *   export __cache_name__.bind(null, label, value)
 *
 * which is a parse error — exported cached functions should never get .bind()
 * treatment because they are module-scoped and have no enclosing function.
 */

// ── Non-cached helper with locals that share names with the cached fn's params ──

export function prepareResult(input) {
  // These locals (`label`, `value`) must NOT leak into getCachedResult's
  // closure capture list — they are scoped to prepareResult, not to the
  // module.
  const label = `[${input.id}]`;
  const value = input.score * 2;
  const extra = "bonus";

  // Call the cached function with the same-named variables as arguments.
  // Before the fix, the plugin would see `label` and `value` inside
  // getCachedResult's body, find them in the flat `locals` array (put
  // there by prepareResult), and incorrectly treat them as closure
  // captures.
  return getCachedResult(label, value, extra);
}

// ── Exported cached function at module level ──

export async function getCachedResult(label, value, extra) {
  "use cache";
  await new Promise((resolve) => setTimeout(resolve, 5));
  return {
    label,
    value,
    extra,
    timestamp: Date.now(),
  };
}
