/**
 * Shared route definitions — imported by both server (App.tsx) and client components.
 *
 * Uses `createRoute` from `@lazarv/react-server/router` which returns a route
 * descriptor with `path`, `validate`, `href()`, and a typed `.Link` component
 * — but no `.Route`. A Vite alias resolves the module to the client-safe
 * version in client/SSR environments.
 */
import { createRoute } from "@lazarv/react-server/router";
import { z } from "zod";

export const home = createRoute("/", { exact: true });

export const about = createRoute("/about", { exact: true });

export const user = createRoute("/user/[id]", {
  exact: true,
  validate: {
    params: z.object({ id: z.coerce.number().int().positive() }),
  },
});

export const products = createRoute("/products", {
  exact: true,
  validate: {
    search: z.object({
      sort: z.enum(["name", "price", "rating"]).default("name"),
      page: z.coerce.number().int().positive().default(1),
    }),
  },
});

export const notFound = createRoute("*");
