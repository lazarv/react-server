import type * as React from "react";

/**
 * The props for the `Link` component.
 *
 * @property to - The route to link to
 * @property target - The target for the link
 * @property local - If true, the link will update the parent outlet
 * @property root - If true, the link will update the root page
 * @property transition - If true, the link will use React useTransition
 * @property push - If true, the link will push the route to the history stack
 * @property replace - If true, the link will replace the current route in the history stack
 * @property prefetch - If true, the link will be prefetched on mouse or touch events
 * @property ttl - The time-to-live for the prefetch
 * @property revalidate - Controls when to revalidate the route cache, defaults to true, set to false to disable revalidation
 * @property rollback - The time-to-live for in case of a back navigation
 * @property noCache - If true, the link will not use the cache
 * @property fallback - The fallback component to render while the link is loading
 * @property Component - The component to render in the outlet
 * @property onNavigate - A callback that is called when the navigation is complete
 * @property onError - A callback that is called when the navigation fails
 */
export type LinkProps<T> = React.PropsWithChildren<{
  to: T;
  search?:
    | Record<string, unknown>
    | ((prev: Record<string, string | string[]>) => Record<string, unknown>);
  target?: string;
  local?: boolean;
  root?: boolean;
  transition?: boolean;
  push?: boolean;
  replace?: boolean;
  prefetch?: boolean;
  ttl?: number;
  revalidate?:
    | boolean
    | number
    | ((context: {
        outlet: string;
        url: string;
        timestamp: number;
      }) => Promise<boolean> | boolean);
  rollback?: number;
  noCache?: boolean;
  fallback?: React.ReactNode;
  Component?: React.ReactNode;
  onNavigate?: () => void;
  onError?: (error: unknown) => void;
}> &
  React.DetailedHTMLProps<
    React.HTMLAttributes<HTMLAnchorElement>,
    HTMLAnchorElement
  >;

/**
 * A component that renders an anchor element that links to a route.
 *
 * @param props - The props for the component
 * @returns The anchor element
 *
 * @example
 *
 * ```tsx
 * import { Link } from '@lazarv/react-server/navigation';
 *
 * export default function App() {
 *  return (
 *   <Link to="/todos">Todos</Link>
 *  );
 * }
 * ```
 */
export function Link<T extends string>(props: LinkProps<T>): React.JSX.Element;

/**
 * The props for the `Refresh` component.
 *
 * @property url - The URL to refresh
 * @property target - The outlet to refresh
 * @property local - If true, the component will refresh the parent outlet
 * @property root - If true, the component will refresh the root page
 * @property transition - If true, the refresh will use React useTransition
 * @property prefetch - If true, the refresh will be prefetched on mouse or touch events
 * @property ttl - The time-to-live for the prefetch
 * @property revalidate - Controls when to revalidate the route cache, defaults to true, set to false to disable revalidation
 * @property noCache - If true, the refresh will not use the cache
 * @property fallback - The fallback component to render while the refresh is loading
 * @property Component - The component to render in the outlet
 * @property onRefresh - A callback that is called when the refresh is complete
 * @property onError - A callback that is called when the refresh fails
 */
export type RefreshProps = React.PropsWithChildren<{
  url?: string;
  target?: string;
  local?: boolean;
  root?: boolean;
  transition?: boolean;
  prefetch?: boolean;
  ttl?: number;
  revalidate?:
    | boolean
    | number
    | ((context: {
        outlet: string;
        url: string;
        timestamp: number;
      }) => Promise<boolean> | boolean);
  noCache?: boolean;
  fallback?: React.ReactNode;
  Component?: React.ReactNode;
  onRefresh?: () => void;
  onError?: (error: unknown) => void;
}> &
  React.DetailedHTMLProps<
    React.HTMLAttributes<HTMLAnchorElement>,
    HTMLAnchorElement
  >;

/**
 * A component that triggers a refresh of the current route.
 *
 * @param props - The props for the component
 * @returns The anchor element
 *
 * @example
 *
 * ```tsx
 * import { Refresh } from '@lazarv/react-server/navigation';
 *
 * export default function App() {
 *  return (
 *   <Refresh>Refresh</Refresh>
 *  );
 * }
 */
export function Refresh(props: RefreshProps): React.JSX.Element;

/**
 * The props for the `Form` component.
 *
 * @property target - The target for the form
 * @property local - If true, the form will update the parent outlet
 * @property root - If true, the form will update the root page
 * @property transition - If true, the form will use React useTransition
 * @property push - If true, the form will push the route to the history stack
 * @property replace - If true, the form will replace the current route in the history stack
 * @property prefetch - If true, the form will be prefetched on mouse or touch events
 * @property ttl - The time-to-live for the prefetch
 * @property revalidate - Controls when to revalidate the route cache, defaults to true, set to false to disable revalidation
 * @property rollback - The time-to-live for in case of a back navigation
 * @property noCache - If true, the form will not use the cache
 * @property onNavigate - A callback that is called when the navigation is complete
 * @property onError - A callback that is called when the navigation fails
 * @property children - The children to render
 */
export type FormProps = Exclude<
  | React.DetailedHTMLProps<
      React.FormHTMLAttributes<HTMLFormElement>,
      HTMLFormElement
    >
  | Exclude<LinkProps<string>, "to">,
  "action" | "method" | "search" | "to"
>;

/**
 * A component that renders a form element that navigates to the current route using form data as the query parameters.
 *
 * @param props - The props for the component
 * @returns The form element
 *
 * @example
 *
 * ```tsx
 * import { Form } from '@lazarv/react-server/navigation';
 *
 * export default function App() {
 *  return (
 *   <Form>
 *     <input type="text" name="name" />
 *     <button type="submit">Submit</button>
 *   </Form>
 *  );
 * }
 * ```
 */
export function Form(props: FormProps): React.JSX.Element;

/**
 * The props for the `ReactServerComponent` component.
 *
 * @property url - The URL to fetch the component from
 * @property outlet - Outlet name to use for the component
 * @property defer - If true, the component is re-fetched after the initial render on the client side
 * @property children - The children to render
 */
export type ReactServerComponentProps = React.PropsWithChildren<{
  url?: string;
  outlet: string;
  defer?: boolean;
}>;

/**
 * A component that renders a server component. The component will be rendered on the server and hydrated on the client.
 *
 * @param props - The props for the component
 * @returns The server component
 *
 * @example
 *
 * ```tsx
 * import { ReactServerComponent } from '@lazarv/react-server/navigation';
 *
 * export default function App() {
 *   return (
 *     <ReactServerComponent url="/todos" outlet="todos" defer />
 *   );
 * }
 */
export function ReactServerComponent(
  props: ReactServerComponentProps
): React.JSX.Element;

/**
 * A hook that returns the current location.
 *
 * @param outlet - which outlet to watch (optional, defaults to root)
 * @returns The current location
 */
export function useLocation(outlet?: string): Location | null;

/**
 * A hook that returns the current search parameters as a plain object.
 * Multi-value keys are returned as arrays.
 *
 * @param outlet - which outlet to watch (optional, defaults to root)
 * @returns The current search parameters as `{ [key]: string | string[] }`, or `null`
 */
export function useSearchParams(
  outlet?: string
): Record<string, string | string[]> | null;

/**
 * A hook that returns the current pathname.
 *
 * @param outlet - which outlet to watch (optional, defaults to root)
 * @returns The current pathname
 */
export function usePathname(outlet?: string): string | null;

/**
 * Options for the client-side useMatch hook.
 */
export type ClientMatchOptions = {
  exact?: boolean;
};

/**
 * A client-side hook that matches a route path pattern against the current pathname.
 * Returns the matched params or null if no match.
 *
 * This is the isomorphic counterpart to the server-side `useMatch` from `@lazarv/react-server/router`.
 * Works in "use client" components.
 *
 * @param path - Route path pattern (e.g. "/users/[id]")
 * @param options - Match options
 * @returns The matched route params, or null
 *
 * @example
 *
 * ```tsx
 * "use client";
 * import { useMatch } from '@lazarv/react-server/navigation';
 *
 * export default function UserProfile() {
 *   const params = useMatch('/users/[id]');
 *   if (!params) return null;
 *   return <p>User: {params.id}</p>;
 * }
 * ```
 */
export function useMatch<T = Record<string, string>>(
  path: string,
  options?: ClientMatchOptions
): T | null;

/**
 * The result type returned by a navigation guard callback.
 * - `true` or `undefined`: allow navigation
 * - `false`: block navigation
 * - `string`: redirect to that URL instead
 */
export type NavigationGuardResult = boolean | string | undefined;

/**
 * A navigation guard callback function.
 * Called before every client-side navigation.
 *
 * @param from - The current pathname
 * @param to - The target pathname
 * @returns Whether to allow the navigation, block it, or redirect
 */
export type NavigationGuard = (
  from: string,
  to: string
) => NavigationGuardResult | Promise<NavigationGuardResult>;

/**
 * Options for `useNavigationGuard`.
 */
export interface NavigationGuardOptions {
  /**
   * When truthy, also registers a `beforeunload` event listener that shows
   * the browser's native "Leave site?" confirmation dialog when the user
   * tries to close the tab or navigate away externally.
   *
   * Pass a reactive boolean (e.g. a `dirty` state) so the listener is only
   * active when there are actually unsaved changes.
   *
   * @default false
   */
  beforeUnload?: boolean;
}

/**
 * React hook to register a navigation guard for the lifetime of the component.
 *
 * The guard callback is called before every client-side navigation.
 * Return `false` to block navigation, a `string` to redirect, or `true`/`undefined` to allow.
 *
 * Use the `beforeUnload` option to also show the browser's native "Leave site?" dialog
 * when the user tries to close the tab or navigate away externally.
 *
 * For pattern matching, use `useMatch()` inside the guard handler rather than a
 * pattern parameter — this is more composable.
 *
 * @param guard - The guard callback
 * @param options - Options for the guard
 *
 * @example
 *
 * ```tsx
 * "use client";
 * import { useNavigationGuard } from '@lazarv/react-server/navigation';
 *
 * // Leave guard with beforeunload support
 * export default function Editor() {
 *   const [dirty, setDirty] = useState(false);
 *
 *   useNavigationGuard(
 *     (from, to) => {
 *       if (dirty) {
 *         return confirm("You have unsaved changes. Leave?");
 *       }
 *     },
 *     { beforeUnload: dirty }
 *   );
 *
 *   return <textarea onChange={() => setDirty(true)} />;
 * }
 * ```
 *
 * @example
 *
 * ```tsx
 * // Enter guard — redirect unauthenticated users
 * useNavigationGuard((from, to) => {
 *   if (!isAuthenticated && to.startsWith("/dashboard")) {
 *     return "/login";
 *   }
 * });
 * ```
 */
export function useNavigationGuard(
  guard: NavigationGuard,
  options?: NavigationGuardOptions
): void;

/**
 * Error class thrown by client-side `redirect()`.
 * Caught by `RedirectBoundary` which uses the proper navigation system
 * to perform the redirect.
 */
export class RedirectError extends Error {
  /** The URL to redirect to */
  url: string;
  /** Whether to replace the current history entry (default: true) */
  replace: boolean;

  constructor(url: string, options?: { replace?: boolean });
}

/**
 * Perform a client-side redirect by throwing a `RedirectError`.
 * Must be called during render inside a component wrapped by a `Route`
 * (which automatically includes a `RedirectBoundary`).
 *
 * The `RedirectBoundary` catches the error and uses the full navigation
 * system to perform the redirect, supporting both client-only and server routes.
 *
 * @param url - The URL to redirect to
 * @param options - Options. `replace` defaults to `true`.
 * @throws {RedirectError}
 *
 * @example
 *
 * ```tsx
 * "use client";
 * import { redirect } from '@lazarv/react-server/navigation';
 *
 * export default function ProtectedPage() {
 *   if (!isAuthenticated) {
 *     redirect("/login");
 *   }
 *   return <div>Secret content</div>;
 * }
 * ```
 */
export function redirect(url: string, options?: { replace?: boolean }): never;

/**
 * Error boundary that catches `RedirectError` thrown by client-side `redirect()`.
 * Uses the proper navigation system to perform the redirect.
 *
 * Automatically wrapped around route content by `Route` — you typically
 * don't need to use this directly.
 *
 * @example
 *
 * ```tsx
 * import { RedirectBoundary } from '@lazarv/react-server/navigation';
 *
 * <RedirectBoundary>
 *   <ProtectedContent />
 * </RedirectBoundary>
 * ```
 */
export class RedirectBoundary extends React.Component<React.PropsWithChildren> {}

export interface ScrollRestorationProps {
  /**
   * The scroll behavior to use when restoring or resetting scroll position.
   * Passed directly to `window.scrollTo({ behavior })`.
   *
   * - `"auto"` — instant scroll (default browser behavior)
   * - `"instant"` — instant scroll (explicit)
   * - `"smooth"` — animated smooth scroll (automatically falls back to `"auto"` when user prefers reduced motion)
   *
   * @default undefined (uses browser default, equivalent to `"auto"`)
   */
  behavior?: ScrollBehavior;
}

/**
 * Provides automatic scroll restoration for client-side navigations.
 *
 * - On **forward navigation** (link clicks): scrolls to top
 * - On **back/forward** (popstate): restores the saved scroll position
 * - Saves scroll positions to `sessionStorage` so they survive page reloads
 * - Automatically respects `prefers-reduced-motion` when `behavior="smooth"`
 *
 * Place this component once at the top level of your app.
 *
 * @example
 *
 * ```tsx
 * "use client";
 * import { ScrollRestoration } from '@lazarv/react-server/navigation';
 *
 * export default function App() {
 *   return (
 *     <>
 *       <ScrollRestoration />
 *       <nav>...</nav>
 *       <main>...</main>
 *     </>
 *   );
 * }
 * ```
 *
 * @example Smooth scrolling
 * ```tsx
 * <ScrollRestoration behavior="smooth" />
 * ```
 */
export function ScrollRestoration(props?: ScrollRestorationProps): null;

/**
 * The position passed to or returned from a scroll position handler.
 */
export interface ScrollPosition {
  x: number;
  y: number;
}

/**
 * Parameters passed to the `useScrollPosition` handler callback.
 */
export interface ScrollPositionParams {
  /** The URL path + search being navigated **to** (e.g. `"/products?sort=price"`). */
  to: string;
  /** The URL path + search being navigated **from**, or `null` on initial page load. */
  from: string | null;
  /**
   * The saved scroll position for the target route (back/forward navigation),
   * or `null` on forward navigation.
   */
  savedPosition: ScrollPosition | null;
}

/**
 * Register a per-route scroll position handler.
 *
 * The handler is called on every navigation with `{ to, from, savedPosition }`.
 * Return `{ x, y }` to scroll to a custom position, `false` to skip scrolling
 * entirely (useful for modal routes), or `undefined`/`null` to fall back to the
 * default behavior.
 *
 * Call this hook from any client component — only the most recently registered
 * handler is active. The handler is automatically unregistered on unmount.
 *
 * @example
 * ```tsx
 * "use client";
 * import { useScrollPosition } from "@lazarv/react-server/navigation";
 *
 * export function ScrollConfig() {
 *   useScrollPosition(({ to }) => {
 *     if (to.startsWith("/modal")) return false;
 *     return undefined; // default behavior
 *   });
 *   return null;
 * }
 * ```
 */
export function useScrollPosition(
  handler: (
    params: ScrollPositionParams
  ) => ScrollPosition | false | undefined | null
): void;

/**
 * Register a scrollable container element for automatic scroll position
 * save/restore alongside the window scroll.
 *
 * @param id - A unique, stable identifier for this container (e.g. `"sidebar"`).
 * @param element - The scrollable DOM element.
 */
export function registerScrollContainer(id: string, element: HTMLElement): void;

/**
 * Unregister a scrollable container previously registered with
 * `registerScrollContainer`.
 */
export function unregisterScrollContainer(id: string): void;

/**
 * Hook that registers a scrollable container element for automatic scroll
 * position save/restore. Handles registration on mount and cleanup on unmount.
 *
 * @param id - A unique, stable identifier for this container (e.g. `"sidebar"`).
 * @param ref - A React ref pointing to the scrollable container element.
 *
 * @example
 * ```tsx
 * "use client";
 * import { useRef } from "react";
 * import { useScrollContainer } from "@lazarv/react-server/navigation";
 *
 * export function Sidebar() {
 *   const ref = useRef<HTMLElement>(null);
 *   useScrollContainer("sidebar", ref);
 *   return <nav ref={ref} style={{ overflow: "auto", height: "100vh" }}>...</nav>;
 * }
 * ```
 */
export function useScrollContainer(
  id: string,
  ref: React.RefObject<HTMLElement>
): void;

// ── Typed route definitions & hooks ──

import type {
  RouteDescriptor,
  RouteValidate,
  RouteParse,
  SearchParamsProps,
  ExtractParams,
} from "../server/router";

// ── Client-safe createRoute (no element, no .Route) ──

interface ClientRouteOptions<TParams = any, TSearch = Record<string, string>> {
  exact?: boolean;
  validate?: RouteValidate<TParams, TSearch>;
  parse?: RouteParse<TParams, TSearch>;
}

/**
 * Client-safe route factory — returns a `RouteDescriptor` with `path`,
 * `validate`, `href()`, `.Link`, `.useParams()`, and `.useSearchParams()`
 * — but no `.Route`.
 *
 * Use this in shared route definition files that are imported by
 * both server components and client components.
 *
 * @example
 * ```ts
 * // routes.ts (shared)
 * import { createRoute } from "@lazarv/react-server/navigation";
 * import { z } from "zod";
 *
 * export const user = createRoute("/user/[id]", {
 *   validate: { params: z.object({ id: z.string() }) },
 * });
 *
 * // Client component:
 * const params = user.useParams();        // typed!
 * user.href({ id: "42" });               // → "/user/42"
 * <user.Link params={{ id: "42" }}>User 42</user.Link>
 * ```
 */
export function createRoute<
  TPath extends string,
  TParams = ExtractParams<TPath>,
  TSearch = Record<string, string>,
>(
  path: TPath,
  options?: ClientRouteOptions<TParams, TSearch>
): RouteDescriptor<TPath, TParams, TSearch>;

export function createRoute(
  path: "*",
  options?: Omit<ClientRouteOptions, "exact">
): RouteDescriptor<"*", {}, {}>;

export function createRoute(
  options?: Omit<ClientRouteOptions, "exact">
): RouteDescriptor<"*", {}, {}>;

export function createRoute(): RouteDescriptor<"*", {}, {}>;

/**
 * Read typed, validated params for a route.
 * Uses the route's `validate.params` schema (if provided) to parse the raw match.
 *
 * @param route - A route created by `createRoute`.
 * @returns Parsed params, or `null` if the route doesn't match / validation fails.
 *
 * @example
 * ```tsx
 * import { useRouteParams } from "@lazarv/react-server/navigation";
 * import { user } from "./routes";
 *
 * const { id } = useRouteParams(user);  // id: string
 * ```
 */
export function useRouteParams<TPath extends string, TParams, TSearch>(
  route: RouteDescriptor<TPath, TParams, TSearch>
): TParams | null;

/**
 * Test if a route matches the current pathname and return typed params (or null).
 *
 * @param route - A route created by `createRoute`.
 * @returns Matched params or null.
 *
 * @example
 * ```tsx
 * import { useRouteMatch } from "@lazarv/react-server/navigation";
 * import { user } from "./routes";
 *
 * const match = useRouteMatch(user);
 * if (match) console.log(match.id);
 * ```
 */
export function useRouteMatch<TPath extends string, TParams, TSearch>(
  route: RouteDescriptor<TPath, TParams, TSearch>
): TParams | null;

/**
 * Read typed, validated search params for a route.
 * Uses the route's `validate.search` schema (if provided) to parse query params.
 *
 * @param route - A route created by `createRoute` with `validate.search`.
 * @returns Parsed search params.
 *
 * @example
 * ```tsx
 * import { useRouteSearchParams } from "@lazarv/react-server/navigation";
 * import { products } from "./routes";
 *
 * const { sort, page } = useRouteSearchParams(products);
 * ```
 */
export function useRouteSearchParams<TPath extends string, TParams, TSearch>(
  route: RouteDescriptor<TPath, TParams, TSearch>
): TSearch;

/** Options when navigating to a route descriptor */
export interface RouteNavigateOptions<TParams = {}, TSearch = {}> {
  /** Path params — required when the route has dynamic segments */
  params?: TParams;
  /**
   * Search params — merged with the current URL search params.
   *
   * Object form: values are merged on top of current params (null removes a key).
   * Function form: receives decoded current search params, returns the next search object.
   */
  search?: Partial<TSearch> | ((prev: TSearch) => TSearch);
  outlet?: string;
  push?: boolean;
  rollback?: number;
  signal?: AbortSignal;
  fallback?: React.ReactNode;
  Component?: React.ReactNode;
}

type NavigateToUrl = import("./index").ReactServerClientContext["navigate"];

/**
 * Navigate function returned by `useNavigate()`.
 *
 * Accepts either:
 * - A URL string + optional nav options (classic mode)
 * - A route descriptor + options with typed `params` and `search` (typed mode)
 *
 * In typed mode, `search` is **merged** with the current URL search params.
 *
 * @example
 * ```tsx
 * const navigate = useNavigate();
 *
 * // Classic — plain URL
 * navigate("/about");
 *
 * // Typed — route with search params (merged with current URL)
 * navigate(products, { search: { sort: "price", page: 2 } });
 *
 * // Typed — route with path params + search
 * navigate(user, { params: { id: "42" }, search: { tab: "posts" } });
 * ```
 */
export interface NavigateFunction {
  /** Navigate to a plain URL string */
  (url: string, options?: Parameters<NavigateToUrl>[1]): Promise<void>;

  /** Navigate to a typed route descriptor */
  <TPath extends string, TParams, TSearch>(
    route: RouteDescriptor<TPath, TParams, TSearch>,
    options?: RouteNavigateOptions<TParams, TSearch>
  ): Promise<void>;
}

/**
 * Returns a `navigate` function that accepts a URL string or a route descriptor.
 *
 * @returns A navigate function.
 *
 * @example
 * ```tsx
 * import { useNavigate } from '@lazarv/react-server/navigation';
 *
 * const navigate = useNavigate();
 * navigate('/about');
 * navigate(products, { search: { sort: 'price' } });
 * ```
 */
export function useNavigate(): NavigateFunction;
