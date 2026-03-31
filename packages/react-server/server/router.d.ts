import type * as React from "react";

export type RouteParams = Record<string, string>;
export type RouteMatchers = Record<string, (value: string) => boolean>;

// ── Path param extraction from route pattern ──

/**
 * Extract typed params from a route path pattern.
 *
 * @example
 * ```ts
 * ExtractParams<"/user/[id]">                  // { id: string }
 * ExtractParams<"/blog/[slug]/[commentId]">    // { slug: string; commentId: string }
 * ExtractParams<"/files/[...path]">            // { path: string[] }
 * ExtractParams<"/about">                      // {}
 * ```
 */
export type ExtractParams<T extends string> =
  T extends `${string}[...${infer P}]${infer R}`
    ? { [K in P]: string[] } & ExtractParams<R>
    : T extends `${string}[${infer P}]${infer R}`
      ? { [K in P]: string } & ExtractParams<R>
      : {};

// ── Schema interface (structural typing — works with Zod, ArkType, Valibot, etc.) ──

/**
 * Schema with Zod / Valibot-style `.safeParse()` + `.parse()`.
 */
export interface SafeParseSchema<T = any> {
  parse(data: unknown): T;
  safeParse(
    data: unknown
  ): { success: true; data: T } | { success: false; error: unknown };
}

/**
 * Schema with ArkType-style `.assert()` (throws on failure, returns `T`).
 */
export interface AssertSchema<T = any> {
  assert(data: unknown): T;
}

/**
 * Schema with a generic `.parse()` that throws on failure.
 */
export interface ParseSchema<T = any> {
  parse(data: unknown): T;
}

/**
 * Any schema that exposes at least one recognized validation method.
 *
 * Supported patterns (tried in this order at runtime):
 * 1. `.safeParse()` — Zod, Valibot
 * 2. `.assert()` — ArkType
 * 3. `.parse()` — generic fallback
 *
 * You can use any library whose schema objects satisfy one of these shapes.
 */
export type ValidateSchema<T = any> =
  | SafeParseSchema<T>
  | AssertSchema<T>
  | ParseSchema<T>;

/** Infer the output type of a ValidateSchema */
export type InferSchema<T> =
  T extends SafeParseSchema<infer U>
    ? U
    : T extends AssertSchema<infer U>
      ? U
      : T extends ParseSchema<infer U>
        ? U
        : never;

// ── Route options ──

export interface RouteValidate<TParams = any, TSearch = any> {
  params?: ValidateSchema<TParams>;
  search?: ValidateSchema<TSearch>;
}

/**
 * Lightweight parser map for route params and search params.
 * Each key maps to a function that converts the raw string to the desired type.
 * Built-in constructors like `Number`, `Boolean`, and `Date` work directly.
 *
 * @example
 * ```ts
 * const user = createRoute("/user/[id]", {
 *   parse: { params: { id: Number } }
 * });
 * // user.useParams() → { id: 42 } instead of { id: "42" }
 * ```
 */
export interface RouteParse<TParams = any, TSearch = any> {
  params?: { [K in keyof TParams]?: (value: string) => TParams[K] };
  search?: { [K in keyof TSearch]?: (value: string) => TSearch[K] };
}

// ── SearchParams component ──

/**
 * Props for the `<SearchParams>` transform boundary.
 *
 * - `decode` — intercepts reading: receives raw `URLSearchParams` from the URL,
 *   returns a cleaned `URLSearchParams` that hooks (`useSearchParams`, etc.) see.
 * - `encode` — intercepts writing (typed Link merge mode): receives the merged
 *   `URLSearchParams` and the current URL params, returns the final
 *   `URLSearchParams` that goes into the URL.
 *
 * Both are optional. Nesting is supported — decode chains outer→inner,
 * encode chains inner→outer.
 */
export interface SearchParamsProps {
  decode?: (searchParams: URLSearchParams) => URLSearchParams;
  encode?: (
    searchParams: URLSearchParams,
    current: URLSearchParams
  ) => URLSearchParams;
  children?: React.ReactNode;
}

/**
 * Bidirectional search-param transform boundary.
 *
 * Wrap your routes (or the entire app) to intercept how search params are
 * read from and written to the URL on the client.
 *
 * @example
 * ```tsx
 * import { SearchParams } from "@lazarv/react-server/router";
 *
 * <SearchParams
 *   decode={(sp) => { sp.delete("utm_source"); return sp; }}
 * >
 *   {children}
 * </SearchParams>
 * ```
 */
export const SearchParams: React.FC<SearchParamsProps>;

/**
 * A route-resource binding — see `@lazarv/react-server/resources`.
 * Returned by `resource.from(mapFn)`.
 */
export interface RouteResourceBinding {
  resource: { query: (key?: any) => Promise<any> };
  mapFn: (
    routeParams: Record<string, any>,
    searchParams: Record<string, any>
  ) => any;
}

/**
 * A resource descriptor (singleton) that can be used directly in
 * a route's `resources` array without `.from()`.
 */
export interface RouteResource {
  query: (key?: any) => Promise<any>;
}

/**
 * Client resource binding(s) from a "use client" module.
 * Opaque on the server — passes through RSC serialization and resolves
 * on the client for navigation pre-loading. Can be a single binding or
 * an array of bindings exported from a "use client" module.
 *
 * Place alongside server bindings in the `resources` array:
 * ```ts
 * resources: [serverBinding, clientBinding]
 * ```
 */
export type ClientRouteResources =
  | RouteResourceBinding
  | (RouteResourceBinding | RouteResource)[];

export interface RouteOptions<
  TPath extends string = string,
  TParams = ExtractParams<TPath>,
  TSearch = Record<string, string>,
> {
  exact?: boolean;
  loading?: React.ComponentType | React.ReactNode;
  matchers?: RouteMatchers;
  render?: (
    params: TParams & { children?: React.ReactNode }
  ) => React.ReactNode;
  children?: React.ReactNode;
  validate?: RouteValidate<TParams, TSearch>;
  parse?: RouteParse<TParams, TSearch>;
  /**
   * Resource bindings to load when this route matches.
   *
   * When a route matches, all bound resources are loaded in parallel
   * and the route waits for the data before rendering the component
   * tree. This eliminates sequential waterfalls from components
   * calling `.use()` one by one.
   *
   * Server bindings and client references can be mixed freely.
   * Route.jsx partitions them automatically by `$$typeof`.
   *
   * @example
   * ```tsx
   * // Server-only resources
   * resources: [userById.from(p => ({ id: p.id })), currentUser]
   *
   * // Dual-loader: server binding + client reference side by side
   * resources: [todosServerMapping, todosClientMapping]
   * ```
   */
  resources?: (RouteResourceBinding | RouteResource | ClientRouteResources)[];
}

// ── RouteDescriptor — minimal shape accepted by client hooks ──

/**
 * Route descriptor returned by the client-safe `createRoute` (from `navigation`).
 * Contains route metadata, `href()`, and a typed `.Link` component — but no `.Route`.
 * Both descriptors and full `TypedRoute` instances satisfy this.
 */
export interface RouteDescriptor<
  TPath extends string = string,
  TParams = ExtractParams<TPath>,
  TSearch = Record<string, string>,
  TSearchInput = TSearch,
> {
  readonly path: TPath | undefined;
  readonly fallback: boolean;
  readonly exact: boolean;
  readonly validate: RouteValidate<TParams, TSearch> | null;
  readonly parse: RouteParse<TParams, TSearch> | null;

  /** Typed Link — only available on addressable routes (not fallbacks) */
  Link: TPath extends "*"
    ? never
    : ExtractParams<TPath> extends Record<string, never>
      ? React.FC<
          Omit<
            import("../client/navigation").LinkProps<string>,
            "to" | "search"
          > & {
            to?: never;
            params?: never;
            search?: TSearchInput | ((prev: TSearch) => TSearchInput);
          }
        >
      : React.FC<
          Omit<
            import("../client/navigation").LinkProps<string>,
            "to" | "search"
          > & {
            to?: never;
            params: TParams;
            search?: TSearchInput | ((prev: TSearch) => TSearchInput);
          }
        >;

  /** Build a URL pathname from params — only available on addressable routes */
  href: TPath extends "*"
    ? never
    : ExtractParams<TPath> extends Record<string, never>
      ? (params?: never) => string
      : (params: TParams) => string;

  /** Hook: read typed, validated params for this route */
  useParams(): TParams | null;

  /** Hook: read typed, validated search params for this route */
  useSearchParams(): TSearch;

  /** Route-scoped SearchParams — decode/encode only apply when this route matches */
  SearchParams: React.FC<SearchParamsProps>;
}

// ── TypedRoute — the object returned by createRoute ──

export interface TypedRoute<
  TPath extends string = string,
  TParams = ExtractParams<TPath>,
  TSearch = Record<string, string>,
  TSearchInput = TSearch,
> extends RouteDescriptor<TPath, TParams, TSearch, TSearchInput> {
  /** Route component — renders with factory defaults; JSX props override */
  Route: React.FC<
    Partial<{
      element: React.ReactNode;
      loading: React.ComponentType | React.ReactNode;
      render: (
        params: TParams & { children?: React.ReactNode }
      ) => React.ReactNode;
      children: React.ReactNode;
      exact: boolean;
      fallback: boolean;
    }>
  >;
}

// ── createRoute overloads ──

/**
 * Create a typed route.
 *
 * @example
 * ```tsx
 * // Path route
 * const user = createRoute("/user/[id]", <UserPage />, {
 *   validate: { params: z.object({ id: z.string().regex(/^\d+$/) }) },
 * });
 *
 * // Fallback route
 * const notFound = createRoute("*", <NotFound />);
 * const alsoNotFound = createRoute(<NotFound />);
 * ```
 */

/** Create a typed route with parse-based search — search params are optional on Link */
export function createRoute<
  TPath extends string,
  TParams = ExtractParams<TPath>,
  TSearch = Record<string, string>,
>(
  path: TPath,
  element: React.ReactNode,
  options: RouteOptions<TPath, TParams, TSearch> & {
    parse: { search: { [K in keyof TSearch]: (value: string) => TSearch[K] } };
  }
): TypedRoute<TPath, TParams, TSearch, Partial<TSearch>>;

export function createRoute<
  TPath extends string,
  TParams = ExtractParams<TPath>,
  TSearch = Record<string, string>,
>(
  path: TPath,
  element: React.ReactNode,
  options?: RouteOptions<TPath, TParams, TSearch>
): TypedRoute<TPath, TParams, TSearch>;

export function createRoute(
  path: "*",
  element: React.ReactNode,
  options?: Omit<RouteOptions<"*">, "exact">
): TypedRoute<"*", {}, {}>;

/** Create a scoped fallback route — matches any URL under the given prefix */
export function createRoute(
  path: `${string}/*`,
  element: React.ReactNode,
  options?: Omit<RouteOptions<string>, "exact">
): TypedRoute<string, {}, {}>;

export function createRoute(
  element: React.ReactNode,
  options?: Omit<RouteOptions<"*">, "exact">
): TypedRoute<"*", {}, {}>;

/** Create a fallback route descriptor (no element / no `.Route`) */
export function createRoute(
  path: "*",
  options?: Omit<RouteOptions<"*">, "exact">
): RouteDescriptor<"*", {}, {}>;

/** Create a scoped fallback descriptor (no element / no `.Route`) */
export function createRoute(
  path: `${string}/*`,
  options?: Omit<RouteOptions<string>, "exact">
): RouteDescriptor<string, {}, {}>;

/** Create a route descriptor with parse-based search — search params are optional on Link */
export function createRoute<
  TPath extends string,
  TParams = ExtractParams<TPath>,
  TSearch = Record<string, string>,
>(
  path: TPath,
  options: RouteOptions<TPath, TParams, TSearch> & {
    parse: { search: { [K in keyof TSearch]: (value: string) => TSearch[K] } };
  }
): RouteDescriptor<TPath, TParams, TSearch, Partial<TSearch>>;

/** Create a route descriptor (no element / no `.Route`) */
export function createRoute<
  TPath extends string,
  TParams = ExtractParams<TPath>,
  TSearch = Record<string, string>,
>(
  path: TPath,
  options?: RouteOptions<TPath, TParams, TSearch>
): RouteDescriptor<TPath, TParams, TSearch>;

/** Create a typed route from an existing route descriptor + element */
export function createRoute<
  TPath extends string,
  TParams = ExtractParams<TPath>,
  TSearch = Record<string, string>,
  TSearchInput = TSearch,
>(
  descriptor: RouteDescriptor<TPath, TParams, TSearch, TSearchInput>,
  element: React.ReactNode,
  options?: {
    loading?: React.ComponentType | React.ReactNode;
    resources?: (RouteResourceBinding | RouteResource | ClientRouteResources)[];
  }
): TypedRoute<TPath, TParams, TSearch, TSearchInput>;

// ── TypedRouter ──

export type TypedRouter<
  T extends Record<string, TypedRoute<any, any, any, any>>,
> = {
  /** Render all routes in declaration order */
  Routes: React.FC;
  /** Global (non-scoped) SearchParams transform boundary */
  SearchParams: React.FC<SearchParamsProps>;
} & {
  [K in keyof T]: T[K];
};

/**
 * Collect typed routes into a router.
 *
 * @example
 * ```tsx
 * const router = createRouter({ home, about, user, notFound });
 *
 * <router.Routes />
 * <router.user.Link params={{ id: "42" }}>User</router.user.Link>
 * ```
 */
export function createRouter<
  T extends Record<string, TypedRoute<any, any, any, any>>,
>(routes: T): TypedRouter<T>;

/**
 * Represents a route in the application.
 *
 * @property path - The path of the route
 * @property exact - If true, the path must match exactly
 * @property matchers - Custom matchers for route parameters
 * @property element - The element to render for the route
 * @property render - A function that returns the element to render for the route
 * @property fallback - If true, the route is a fallback route
 *
 * @example
 *
 * ```tsx
 * import { Route } from '@lazarv/react-server';
 *
 * export default function App() {
 *  return (
 *   <Route path="/todos" exact>
 *    <Todos />
 *   </Route>
 *  );
 * }
 */
export const Route: React.FC<
  React.PropsWithChildren<{
    path: string;
    exact?: boolean;
    matchers?: RouteMatchers;
    element?: React.ReactElement;
    render?: (
      props: React.PropsWithChildren<RouteParams>
    ) => React.ReactElement;
    fallback?: boolean;
  }>
>;

/**
 * Represents the state of a server action.
 *
 * @typeParam T - The type of the server action, usually inferred from the action reference
 * @typeParam E - The type of the error returned by the action, optional
 *
 * @property formData - The form data that was sent with the action
 * @property data - The data returned by the action
 * @property error - The error returned by the action, if any
 * @property actionId - The internal id of the action
 */
export type ActionState<T, E> = {
  formData: FormData | null;
  data: T | null;
  error: E | null;
  actionId: string | null;
};

/**
 * This hook returns the current state of the passed server action.
 * The state includes the form data, the data returned by the action, the error if the action failed and also the action's internal id.
 *
 * @returns The current state of the referenced action
 *
 * @typeParam T - The type of the server action, usually inferred from the action reference
 * @typeParam E - The type of the error returned by the action, optional
 * @param action Server action reference for which you want to get the action state
 *
 * @example
 *
 * ```tsx
 * import { useActionState } from '@lazarv/react-server';
 * import { addTodo } from './actions';
 *
 * export default function AddTodo() {
 *  const { formData, error } = useActionState(addTodo);
 *  return (
 *   <form action={addTodo}>
 *    <input name="title" type="text" defaultValue={formData?.get?.("title") as string} />
 *    <button type="submit">Submit</button>
 *    {error?.map?.(({ message }, i) => (
 *     <p key={i}>{message}</p>
 *    )) ?? (error && (
 *     <p>{error}</p>
 *    ))}
 *   </form>
 *  );
 * }
 * ```
 */
export function useActionState<
  T extends (...args: any[]) => T extends (...args: any[]) => infer R ? R : any,
  E = Error,
>(action: T): ActionState<ReturnType<T>, E>;

/**
 * Options for the useMatch hook.
 *
 * @property exact - If true, the path must match exactly
 * @property fallback - If true, the route is a fallback route
 * @property matchers - Custom matchers for route parameters
 */
export type MatchOptions = {
  exact?: boolean;
  fallback?: boolean;
  matchers?: RouteMatchers;
};

/**
 * This hook returns the route parameters for the given path.
 *
 * @param path The path to match
 * @param options Options for the match
 *
 * @returns The route parameters for the given path
 *
 * @example
 *
 * ```tsx
 * import { useMatch } from '@lazarv/react-server';
 *
 * export default function Todo() {
 *  const { id } = useMatch('/todos/[id]');
 *  return <p>Todo id: {id}</p>;
 * }
 * ```
 */
export function useMatch<T = RouteParams>(
  path: string,
  options?: MatchOptions
): T | null;
