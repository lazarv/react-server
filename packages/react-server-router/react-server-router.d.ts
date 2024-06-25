declare namespace __react_server_routing__ {
  // start generation types
  type __react_server_router_static_routes__ = any;
  type __react_server_router_dynamic_route_infer_types__<T> = T;
  type __react_server_router_dynamic_route_definitions__ = any;
  type __react_server_routing_params_patterns__ = never;
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
}

declare module "@lazarv/react-server/navigation" {
  import type { LinkProps as OriginalLinkProps } from "@lazarv/react-server/client/navigation.d.ts";
  export * from "@lazarv/react-server/client/navigation.d.ts";

  export type LinkProps<T> = Omit<OriginalLinkProps<T>, "to"> & {
    to: __react_server_routing__.RouteImpl<T>;
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
      options?: { outlet?: string; push?: boolean; rollback?: number }
    ): Promise<void>;
    replace<T extends string>(
      url: __react_server_routing__.RouteImpl<T>,
      options?: { outlet?: string; rollback?: number }
    ): Promise<void>;
    prefetch<T extends string>(
      url: __react_server_routing__.RouteImpl<T>,
      options?: { outlet?: string; ttl?: number }
    ): Promise<void>;
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
