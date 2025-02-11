declare namespace __react_server_routing__ {
  // start generation types
  type __react_server_router_static_routes__ = any;
  type __react_server_router_dynamic_route_infer_types__<T> = T;
  type __react_server_router_dynamic_route_definitions__ = any;
  type __react_server_routing_params_patterns__ = never;
  type __react_server_routing_outlets__ = string;
  // end

  type SearchOrHash = `?${string}` | `#${string}`;
  type Protocol<P extends string> = P extends `${string}/${string}` ? never : P;
  type WithProtocol<P extends string> = `${Protocol<P>}://${string}`;

  type Suffix = "" | SearchOrHash;

  type SafeSlug<S extends string> = S extends `${string}/${string}`
    ? never
    : S extends `${string}${SearchOrHash}`
      ? never
      : S extends ""
        ? never
        : S;

  type CatchAllSlug<S extends string> = S extends `${string}${SearchOrHash}`
    ? never
    : S extends ""
      ? never
      : S extends `${string}/${string}`
        ? S
        : S extends SafeSlug<S>
          ? S
          : never;

  type OptionalCatchAllSlug<S extends string> =
    S extends `${string}${SearchOrHash}` ? never : S;

  type StaticRoutes = __react_server_router_static_routes__;
  type DynamicRoutes<__react_server_router_dynamic_route_types__> =
    __react_server_router_dynamic_route_definitions__;

  type RouteImpl<T> =
    | StaticRoutes
    | SearchOrHash
    | (T extends WithProtocol<infer _> ? T : never)
    | `${StaticRoutes}${SearchOrHash}`
    | (T extends `${DynamicRoutes<__react_server_router_dynamic_route_infer_types__<T>>}${Suffix}`
        ? T
        : never);

  type Param<P, R> = P extends `[[...${infer K}]]`
    ? { [key in K]?: string[] }
    : P extends `[...${infer K}]`
      ? { [key in K]: string[] }
      : P extends `[[${infer K}]]`
        ? { [key in K]?: string } & R
        : P extends __react_server_routing_params_patterns__
          ? never
          : P extends `[${infer K}]`
            ? { [key in K]: string } & R
            : R;
  type ExtractParams<T> = T extends `${infer P}/${infer R}`
    ? Param<P, ExtractParams<R>>
    : Param<T, unknown>;
  type RouteParams<T> = T extends StaticRoutes
    ? boolean
    : T extends DynamicRoutes<
          __react_server_router_dynamic_route_infer_types__<T>
        >
      ? ExtractParams<T>
      : never;

  type Outlet = __react_server_routing_outlets__;
}

declare module "@lazarv/react-server/navigation" {
  import type {
    LinkProps as OriginalLinkProps,
    RefreshProps as OriginalRefreshProps,
    ReactServerComponentProps as OriginalReactServerComponentProps,
  } from "@lazarv/react-server/client/navigation.d.ts";
  export * from "@lazarv/react-server/client/navigation.d.ts";

  export type LinkProps<T> = Omit<OriginalLinkProps<T>, "to" | "target"> & {
    to: __react_server_routing__.RouteImpl<T>;
    target?: __react_server_routing__.Outlet;
  };

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
  export function Link<T>(
    props: LinkProps<__react_server_routing__.RouteImpl<T>>
  ): JSX.Element;

  export type RefreshProps = Omit<OriginalRefreshProps, "target"> & {
    target?: __react_server_routing__.Outlet;
  };

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
  export function Refresh(props: RefreshProps): JSX.Element;

  export type ReactServerComponentProps = Omit<
    OriginalReactServerComponentProps,
    "url" | "outlet"
  > & {
    url?: string;
    outlet: __react_server_routing__.Outlet;
  };

  /**
   * The props for the `ReactServerComponent` component.
   *
   * @property url - The URL to fetch the component from
   * @property outlet - Outlet name to use for the component
   * @property defer - If true, the component is re-fetched after the initial render on the client side
   * @property children - The children to render
   */
  export function ReactServerComponent(
    props: ReactServerComponentProps
  ): JSX.Element;

  /**
   * A hook that returns the current location.
   *
   * @param outlet - which outlet to watch (optional, defaults to root)
   * @returns The current location
   */
  export function useLocation(
    outlet?: __react_server_routing__.Outlet
  ): Location | null;

  /**
   * A hook that returns the current search parameters.
   *
   * @param outlet - which outlet to watch (optional, defaults to root)
   * @returns The current search parameters
   */
  export function useSearchParams(
    outlet?: __react_server_routing__.Outlet
  ): URLSearchParams | null;

  /**
   * A hook that returns the current pathname.
   *
   * @param outlet - which outlet to watch (optional, defaults to root)
   * @returns The current pathname
   */
  export function usePathname(
    outlet?: __react_server_routing__.Outlet
  ): string | null;
}

declare module "@lazarv/react-server/client" {
  import type { ReactServerClientContext as OriginalReactServerClientContext } from "@lazarv/react-server/client/index.d.ts";
  export * from "@lazarv/react-server/client/index.d.ts";

  /**
   * The client context.
   *
   * @property refresh - Refreshes the current route
   * @property prefetch - Prefetches a route
   * @property navigate - Navigates to a route
   * @property replace - Replaces the current route
   */
  export type ReactServerClientContext = Omit<
    OriginalReactServerClientContext,
    "navigate" | "replace" | "prefetch"
  > & {
    navigate<T extends string>(
      url: __react_server_routing__.RouteImpl<T>,
      options?: {
        outlet?: __react_server_routing__.Outlet;
        push?: boolean;
        rollback?: number;
        revalidate?:
          | boolean
          | number
          | ((context: {
              outlet: string;
              url: string;
              timestamp: number;
            }) => Promise<boolean> | boolean);
        fallback?: React.ReactNode;
        Component?: React.ReactNode;
      }
    ): Promise<void>;
    replace<T extends string>(
      url: __react_server_routing__.RouteImpl<T>,
      options?: {
        outlet?: __react_server_routing__.Outlet;
        rollback?: number;
        revalidate?:
          | boolean
          | number
          | ((context: {
              outlet: string;
              url: string;
              timestamp: number;
            }) => Promise<boolean> | boolean);
        fallback?: React.ReactNode;
        Component?: React.ReactNode;
      }
    ): Promise<void>;
    prefetch<T extends string>(
      url: __react_server_routing__.RouteImpl<T>,
      options?: { outlet?: __react_server_routing__.Outlet; ttl?: number }
    ): Promise<void>;
    abort(outlet?: __react_server_routing__.Outlet, reason?: Error): void;
  };

  /**
   * A hook that returns the client context.
   *
   * @returns The client context
   */
  export function useClient(): ReactServerClientContext;
}

declare module "@lazarv/react-server/router" {
  import type { MatchOptions } from "@lazarv/react-server/server/router.d.ts";
  export * from "@lazarv/react-server/server/router.d.ts";

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
  export function useMatch<T>(
    path: __react_server_routing__.RouteImpl<T>,
    options?: MatchOptions
  ): __react_server_routing__.RouteParams<T> | null;
}
