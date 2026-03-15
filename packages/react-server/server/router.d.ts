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

// ── Zod-like schema interface (minimal structural typing) ──

/**
 * Minimal interface matching Zod's `.safeParse()` / `.parse()` API.
 * Any schema library with this shape will work.
 */
export interface ValidateSchema<T = any> {
  parse(data: unknown): T;
  safeParse(
    data: unknown
  ): { success: true; data: T } | { success: false; error: unknown };
}

/** Infer the output type of a ValidateSchema */
export type InferSchema<T> = T extends ValidateSchema<infer U> ? U : never;

// ── Route options ──

export interface RouteValidate<TParams = any, TSearch = any> {
  params?: ValidateSchema<TParams>;
  search?: ValidateSchema<TSearch>;
}

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
> {
  readonly path: TPath | undefined;
  readonly fallback: boolean;
  readonly exact: boolean;
  readonly validate: RouteValidate<TParams, TSearch> | null;

  /** Typed Link — only available on addressable routes (not fallbacks) */
  Link: TPath extends "*"
    ? never
    : ExtractParams<TPath> extends Record<string, never>
      ? React.FC<
          Omit<import("../client/navigation").LinkProps<string>, "to"> & {
            to?: never;
            params?: never;
            search?: TSearch;
          }
        >
      : React.FC<
          Omit<import("../client/navigation").LinkProps<string>, "to"> & {
            to?: never;
            params: TParams;
            search?: TSearch;
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
}

// ── TypedRoute — the object returned by createRoute ──

export interface TypedRoute<
  TPath extends string = string,
  TParams = ExtractParams<TPath>,
  TSearch = Record<string, string>,
> extends RouteDescriptor<TPath, TParams, TSearch> {
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

export function createRoute(
  element: React.ReactNode,
  options?: Omit<RouteOptions<"*">, "exact">
): TypedRoute<"*", {}, {}>;

/** Create a fallback route descriptor (no element / no `.Route`) */
export function createRoute(
  path: "*",
  options?: Omit<RouteOptions<"*">, "exact">
): RouteDescriptor<"*", {}, {}>;

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
>(
  descriptor: RouteDescriptor<TPath, TParams, TSearch>,
  element: React.ReactNode
): TypedRoute<TPath, TParams, TSearch>;

// ── TypedRouter ──

export type TypedRouter<T extends Record<string, TypedRoute<any, any, any>>> = {
  /** Render all routes in declaration order */
  Routes: React.FC;
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
  T extends Record<string, TypedRoute<any, any, any>>,
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
