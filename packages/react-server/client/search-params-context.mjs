"use client";

import { createContext } from "react";

/**
 * Context for the SearchParams decode/encode transform chain.
 *
 * - `decode`: transforms raw URLSearchParams from the URL before they're
 *   consumed by `useSearchParams()` / route hooks.
 * - `encode`: transforms URLSearchParams before they're written to the URL
 *   (via typed Link merge mode).
 *
 * Both default to `null` (identity / no transform).
 */
export const SearchParamsTransformContext = createContext({
  decode: null,
  encode: null,
});
