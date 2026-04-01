"use client";

import { useContext, useMemo } from "react";

import { useLocation } from "./location.mjs";
import { match } from "../lib/route-match.mjs";
import { SearchParamsTransformContext } from "./search-params-context.mjs";

/**
 * Read the current decode/encode transforms from context.
 */
export function useSearchParamsTransform() {
  return useContext(SearchParamsTransformContext);
}

/**
 * `<SearchParams>` — bidirectional search-param transform boundary.
 *
 * Wraps children in a context that intercepts how search params are
 * read from and written to the URL.
 *
 * - `decode(sp)` — called when reading: receives raw `URLSearchParams`
 *   from the URL, returns a cleaned `URLSearchParams` that hooks see.
 * - `encode(sp, current)` — called when writing (typed Link merge mode):
 *   receives the merged `URLSearchParams` and the current URL params,
 *   returns the final `URLSearchParams` that goes into the URL.
 * - `route` (optional, internal) — when set, the transforms only apply
 *   if the route matches the current pathname.
 *
 * Nesting is supported — decode chains outer→inner, encode chains inner→outer.
 *
 * @example
 * ```tsx
 * import { SearchParams } from "@lazarv/react-server/router";
 *
 * <SearchParams
 *   decode={(sp) => {
 *     sp.delete("utm_source");
 *     sp.delete("fbclid");
 *     return sp;
 *   }}
 * >
 *   {children}
 * </SearchParams>
 * ```
 */
export default function SearchParams({ decode, encode, route, children }) {
  const parent = useContext(SearchParamsTransformContext);
  const location = useLocation();

  // Route-scoped: only active when the route matches the current pathname.
  const isActive =
    !route ||
    (location && match(route.path, location.pathname, { exact: route.exact }));

  const value = useMemo(() => {
    if (!isActive) return parent;

    return {
      // decode chain: parent (outer) runs first, then self (inner)
      decode: decode
        ? (sp) => {
            try {
              const parentDecoded = parent.decode ? parent.decode(sp) : sp;
              return decode(parentDecoded);
            } catch (err) {
              console.error(
                "[react-server] SearchParams decode() threw. " +
                  "The raw search params will be used instead. " +
                  "Check your decode function.",
                err
              );
              return sp;
            }
          }
        : parent.decode,
      // encode chain: self (inner) runs first, then parent (outer)
      encode: encode
        ? (sp, current) => {
            try {
              const selfEncoded = encode(sp, current);
              return parent.encode
                ? parent.encode(selfEncoded, current)
                : selfEncoded;
            } catch (err) {
              console.error(
                "[react-server] SearchParams encode() threw. " +
                  "The un-encoded search params will be used instead. " +
                  "Check your encode function.",
                err
              );
              return sp;
            }
          }
        : parent.encode,
    };
  }, [decode, encode, parent, isActive]);

  return (
    <SearchParamsTransformContext.Provider value={value}>
      {children}
    </SearchParamsTransformContext.Provider>
  );
}
