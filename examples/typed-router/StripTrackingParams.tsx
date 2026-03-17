"use client";

import type { SearchParamsProps } from "@lazarv/react-server/router";
import { products } from "./routes";

/**
 * Route-scoped SearchParams transform for /products.
 *
 * Stores the price filter as a compact `?price=min-max` in the URL, but
 * exposes it to Zod validation as separate `?min_price` / `?max_price` params.
 *
 *   decode:  ?price=0-500  →  ?min_price=0&max_price=500   (URL → app)
 *   encode:  ?min_price=0&max_price=500  →  ?price=0-500   (app → URL)
 *
 * Because `products.SearchParams` is route-scoped, the transforms only activate
 * when the current pathname matches /products.
 */

function decode(sp: URLSearchParams): URLSearchParams {
  const range = sp.get("price");
  if (!range) return sp;
  const dash = range.indexOf("-");
  if (dash === -1) return sp;
  const result = new URLSearchParams(sp);
  result.delete("price");
  result.set("min_price", range.slice(0, dash));
  result.set("max_price", range.slice(dash + 1));
  return result;
}

function encode(sp: URLSearchParams): URLSearchParams {
  const min = sp.get("min_price");
  const max = sp.get("max_price");
  if (min == null && max == null) return sp;
  const result = new URLSearchParams(sp);
  result.delete("min_price");
  result.delete("max_price");
  result.delete("price");
  result.set("price", `${min ?? 0}-${max ?? 10000}`);
  return result;
}

export default function ProductPriceRange({ children }: SearchParamsProps) {
  return (
    <products.SearchParams decode={decode} encode={encode}>
      {children}
    </products.SearchParams>
  );
}
