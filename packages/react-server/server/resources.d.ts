import type {
  ValidateSchema,
  InferSchema,
  SafeParseSchema,
  AssertSchema,
  ParseSchema,
} from "./router";

// ── Resource key types ──

/**
 * Infer the key type from a resource's key schema or parse map.
 *
 * - Schema (Zod, ArkType, Valibot): infers output type via InferSchema
 * - Parse map ({ id: Number }): infers return types of parser functions per key
 * - null/undefined: no key (singleton resource)
 */
type InferKey<T> =
  T extends ValidateSchema<infer U>
    ? U
    : T extends Record<string, (value: string) => any>
      ? { [K in keyof T]: T[K] extends (value: string) => infer V ? V : never }
      : T extends null | undefined
        ? void
        : never;

/**
 * Infer the parsed key type from a parse map.
 * Each key's type is the return type of its parser function.
 *
 * @example
 * ```ts
 * InferParseMap<{ id: NumberConstructor, slug: StringConstructor }>
 * // → { id: number, slug: string }
 * ```
 */
type InferParseMap<T extends Record<string, (value: string) => any>> = {
  [K in keyof T]: ReturnType<T[K]>;
};

// ── Route binding ──

/**
 * A route-resource binding returned by `.from()`.
 * Used in createRoute's `resources` option to load data when a route matches.
 */
export interface ResourceBinding<TKey = void, TData = unknown> {
  resource: ResourceDescriptor<TKey, TData>;
  mapFn: (
    routeParams: Record<string, any>,
    searchParams: Record<string, any>
  ) => TKey extends void ? void : TKey;
}

// ── ResourceDescriptor ──

/**
 * A typed resource descriptor with suspense-integrated data fetching,
 * imperative queries, cache prefetching, and invalidation.
 *
 * Created by `createResource(options?)` (descriptor only, no loader).
 * Call `.bind(loaderFn)` to attach a loader.
 */
export interface ResourceDescriptor<TKey = void, TData = unknown> {
  /** @internal Resource tag symbol */
  readonly _loader: ((key: TKey) => TData | Promise<TData>) | null;

  /** Key schema (validation schema or parse map), or null for singletons */
  readonly key:
    | ValidateSchema<TKey>
    | Record<string, (value: string) => any>
    | null;

  /**
   * React hook — suspense-integrated data fetching.
   *
   * Calls the bound loader with the validated key and suspends
   * (via `React.use()`) until the data is available.
   *
   * @param key - Resource key (omit for singleton resources)
   * @returns The resource data
   *
   * @example
   * ```tsx
   * const user = userById.use({ id: 42 });
   * const me = currentUser.use();
   * ```
   */
  use: TKey extends void ? () => TData : (key: TKey) => TData;

  /**
   * Imperative data fetching — returns a Promise.
   *
   * Does NOT suspend. Use in event handlers, server actions, or
   * anywhere outside React's render cycle.
   *
   * @param key - Resource key (omit for singleton resources)
   * @returns Promise resolving to the resource data
   *
   * @example
   * ```ts
   * const user = await userById.query({ id: 42 });
   * ```
   */
  query: TKey extends void
    ? () => Promise<TData>
    : (key: TKey) => Promise<TData>;

  /**
   * Warm the cache without suspending or awaiting.
   * Fire-and-forget — the result is discarded.
   *
   * @param key - Resource key (omit for singleton resources)
   *
   * @example
   * ```ts
   * userById.prefetch({ id: 42 });
   * ```
   */
  prefetch: TKey extends void ? () => void : (key: TKey) => void;

  /**
   * Invalidate cached entries for this resource.
   *
   * - `invalidate()` — all entries for this resource's loader
   * - `invalidate(key)` — specific entry matching the key
   *
   * Delegates to the framework's `invalidate()` from `@lazarv/react-server/cache`.
   * Works on both server and client. On the client, clears entries from
   * whichever browser storage provider `"use cache"` is using.
   *
   * @param key - Specific key to invalidate (omit for all entries)
   *
   * @example
   * ```ts
   * userById.invalidate({ id: 42 }); // specific entry
   * userById.invalidate();           // all entries
   * ```
   */
  invalidate: TKey extends void
    ? () => void | Promise<void>
    : (key?: TKey) => void | Promise<void>;

  /**
   * Create a route-resource binding for route-level data loading.
   *
   * Returns a `{ resource, mapFn }` tuple for use in createRoute's
   * `resources` option. When the route matches, the resource is loaded
   * in parallel with other bindings and the route waits for all data
   * before rendering.
   *
   * For dual-loader resources, place client bindings (from "use client"
   * modules) alongside server bindings in the `resources` array.
   * Route.jsx partitions them automatically by $$typeof.
   *
   * @param mapFn - Maps (routeParams, searchParams) to resource key
   * @returns Route-resource binding
   *
   * @example
   * ```ts
   * const user = createRoute(routes.user, <UserPage />, {
   *   resources: [
   *     userById.from((params) => ({ id: params.id })),
   *   ],
   * });
   *
   * // Dual-loader: server + client bindings side by side
   * const todos = createRoute(routes.todos, <TodosPage />, {
   *   resources: [todosServerMapping, todosClientMapping],
   * });
   * ```
   */
  from: TKey extends void
    ? never
    : (
        mapFn: (
          routeParams: Record<string, any>,
          searchParams: Record<string, any>
        ) => TKey
      ) => ResourceBinding<TKey, TData>;

  /**
   * Bind a loader function to this resource descriptor.
   *
   * Mutates the descriptor to attach the loader, then returns it
   * with the `TData` type inferred from the loader's return type.
   * Add `"use cache"` to the loader body for caching.
   *
   * @param loader - Async function that fetches the data
   * @returns The same descriptor with `TData` narrowed to the loader's return type
   *
   * @example
   * ```ts
   * export const userById = r.userById.bind(async ({ id }) => {
   *   "use cache";
   *   return db.users.findById(id);
   * });
   * ```
   */
  bind: <TBoundData>(
    loader: TKey extends void
      ? () => TBoundData | Promise<TBoundData>
      : (key: TKey) => TBoundData | Promise<TBoundData>
  ) => ResourceDescriptor<TKey, TBoundData>;
}

// ── createResource overloads ──

/**
 * Create a singleton resource descriptor (no key).
 *
 * @example
 * ```ts
 * export const currentUser = createResource();
 * ```
 */
export function createResource(): ResourceDescriptor<void>;

/**
 * Create a resource descriptor with a validation schema key (Zod, ArkType, Valibot).
 *
 * @example
 * ```ts
 * export const userById = createResource({
 *   key: z.object({ id: z.coerce.number().int().positive() }),
 * });
 * ```
 */
export function createResource<TKey>(options: {
  key: ValidateSchema<TKey>;
}): ResourceDescriptor<TKey>;

/**
 * Create a resource descriptor with a lightweight parse map key.
 *
 * Each key maps a field name to a coercion function (e.g., `Number`, `String`, `Boolean`).
 * The resource key type is inferred from the return types of the coercion functions.
 *
 * @example
 * ```ts
 * export const postBySlug = createResource({
 *   key: { slug: String },
 * });
 * // Key type: { slug: string }
 *
 * export const userById = createResource({
 *   key: { id: Number },
 * });
 * // Key type: { id: number }
 * ```
 */
export function createResource<
  TParseMap extends Record<string, (value: string) => any>,
>(options: { key: TParseMap }): ResourceDescriptor<InferParseMap<TParseMap>>;

// ── createResources ──

/**
 * A resource collection with individual resources and `invalidateAll()`.
 */
export type ResourceCollection<
  T extends Record<string, ResourceDescriptor<any, any>>,
> = T & {
  /** Invalidate all cached entries for every resource in the collection */
  invalidateAll(): Promise<void[]>;
};

/**
 * Collect resources into a typed registry.
 *
 * @example
 * ```ts
 * export const resources = createResources({ userById, posts, currentUser });
 * resources.invalidateAll(); // bust all caches
 * ```
 */
export function createResources<
  T extends Record<string, ResourceDescriptor<any, any>>,
>(resources: T): ResourceCollection<T>;
