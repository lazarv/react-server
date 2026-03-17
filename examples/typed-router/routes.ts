/**
 * Shared route definitions — imported by both server (App.tsx) and client components.
 *
 * Uses `createRoute` from `@lazarv/react-server/router` which returns a route
 * descriptor with `path`, `validate`, `parse`, `href()`, and a typed `.Link`
 * component — but no `.Route`. A Vite alias resolves the module to the
 * client-safe version in client/SSR environments.
 */
import { createRoute } from "@lazarv/react-server/router";
import { z } from "zod";

export const home = createRoute("/", { exact: true });

export const about = createRoute("/about", { exact: true });

// Zod `validate` — full schema-based validation with defaults and coercion.
export const user = createRoute("/user/[id]", {
  exact: true,
  validate: {
    params: z.object({ id: z.coerce.number().int().positive() }),
  },
});

// Lightweight `parse` — custom coercion and validation without a library.
// `tab` validates against an allowlist and falls back to "content" for unknown
// values, showing that parse functions can enforce constraints, not just cast types.
export const post = createRoute("/post/[slug]", {
  exact: true,
  parse: {
    params: { slug: String },
    search: {
      tab: (v: string): "content" | "comments" | "related" =>
        (["content", "comments", "related"] as const).includes(
          v as "content" | "comments" | "related"
        )
          ? (v as "content" | "comments" | "related")
          : "content",
      q: String,
    },
  },
});

// Zod `validate` + SearchParams decode/encode: the ?price=min-max URL format
// is decoded to ?min_price=...&max_price=... before Zod sees it, and encoded
// back to compact form when navigating. See StripTrackingParams.tsx.
export const products = createRoute("/products", {
  exact: true,
  validate: {
    search: z.object({
      sort: z.enum(["name", "price", "rating"]).catch("name"),
      page: z.coerce.number().int().positive().catch(1),
      // Decoded from ?price=min-max by the ProductPriceRange SearchParams transform.
      // .catch() provides a safe default for any invalid or missing values.
      min_price: z.coerce.number().min(0).max(10000).catch(0),
      max_price: z.coerce.number().min(0).max(10000).catch(10000),
    }),
  },
});

export const notFound = createRoute("*");
