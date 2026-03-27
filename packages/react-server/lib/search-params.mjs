import { applyParsers } from "./apply-parsers.mjs";

/**
 * Convert URLSearchParams to a plain object.
 * Multi-value keys become arrays.
 */
export function searchParamsToObject(sp) {
  const obj = {};
  for (const key of sp.keys()) {
    const values = sp.getAll(key);
    obj[key] = values.length === 1 ? values[0] : values;
  }
  return obj;
}

/**
 * Apply a route's validate/parse schema to a raw search params object.
 * Mirrors the logic in `useRouteSearchParams` but works outside of hooks.
 *
 * @param {Record<string, string | string[]>} raw
 * @param {{ validate?: { search?: { safeParse: Function } }, parse?: { search?: Record<string, Function> } } | null} route
 * @returns {Record<string, unknown>}
 */
export function validateSearchParams(raw, route) {
  if (!route) return raw;
  if (route.validate?.search) {
    const result = route.validate.search.safeParse(raw);
    return result.success ? result.data : raw;
  }
  if (route.parse?.search) {
    return applyParsers(raw, route.parse.search);
  }
  return raw;
}

/**
 * Resolve a search updater (object or function) into a plain object.
 * When `search` is a function, `current` URLSearchParams are converted
 * to a plain object and passed as `prev`.
 *
 * When a `route` descriptor is provided, the raw params are run through
 * the route's `validate.search` or `parse.search` before being passed
 * to the updater — so `prev` has the same coerced/defaulted values that
 * `useSearchParams()` returns.
 *
 * @param {Record<string, unknown> | ((prev: Record<string, string | string[]>) => Record<string, unknown>)} search
 * @param {URLSearchParams} current - current URL search params
 * @param {((sp: URLSearchParams) => URLSearchParams) | null} [decodeSearch] - decode transform
 * @param {object | null} [route] - route descriptor with validate/parse
 * @returns {Record<string, unknown>}
 */
export function resolveSearchUpdater(search, current, decodeSearch, route) {
  if (typeof search === "function") {
    const decoded = decodeSearch ? decodeSearch(current) : current;
    const raw = searchParamsToObject(decoded);
    const prev = validateSearchParams(raw, route);
    return search(prev);
  }
  return search;
}

/**
 * Apply a search object onto a URLSearchParams instance (merge mode).
 * null/undefined values delete the key.
 *
 * @param {URLSearchParams} target
 * @param {Record<string, unknown>} searchObj
 */
export function applySearchObject(target, searchObj) {
  for (const [k, v] of Object.entries(searchObj)) {
    if (v == null) {
      target.delete(k);
    } else {
      target.set(k, String(v));
    }
  }
}
