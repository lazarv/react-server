declare module "@lazarv/react-server" {
  import type { RequestContextExtensions } from "@hattip/compose";
  import type { CookieSerializeOptions } from "@hattip/cookie";
  import type { AdapterRequestContext } from "@hattip/core";

  export function withCache<T extends React.FC>(
    Component: T,
    ttl?: number | true
  ): T;
  export function redirect(url: string, status?: number): void;

  export function useHttpContext(): AdapterRequestContext;
  export function useRequest(): Request;
  export function useResponse(): Response;
  export function useUrl(): URL;
  export function useFormData(): FormData;
  export function rewrite(pathname: string): void;

  export function revalidate(key?: string): void;
  export function status(status?: number, statusText?: string): void;
  export function headers(headers?: Record<string, string>): void;

  export type Cookies = RequestContextExtensions["cookie"];
  export function cookie(): Cookies;
  export function setCookie(
    name: string,
    value: string,
    options?: CookieSerializeOptions
  ): void;
  export function deleteCookie(
    name: string,
    options?: CookieSerializeOptions
  ): void;

  export interface ReactServerCache {
    get<T = unknown>(keys: string[]): Promise<T | undefined>;
    set<T = unknown>(keys: string[], value: T): Promise<void>;
    has(keys: string[]): Promise<boolean>;
    setExpiry(keys: string[], ttl: number): Promise<void>;
    hasExpiry(keys: string[], ttl: number): Promise<boolean>;
    delete(keys: string[]): Promise<void>;
  }
}

declare module "@lazarv/react-server/client" {
  export type ReactServerClientContext = {
    registerOutlet(outlet: string, url: string): void;
    refresh(outlet?: string): Promise<void>;
    prefetch(
      url: __react_server_routing__.ReactServerRouting["path"],
      options?: { outlet?: string; ttl?: number }
    ): Promise<void>;
    navigate(
      url: __react_server_routing__.ReactServerRouting["path"],
      options?: { outlet?: string; push?: boolean; rollback?: number }
    ): Promise<void>;
    replace(
      url: __react_server_routing__.ReactServerRouting["path"],
      options?: { outlet?: string; rollback?: number }
    ): Promise<void>;
    subscribe(
      url: __react_server_routing__.ReactServerRouting["path"],
      listener: (
        to: string,
        done?: (err: unknown | null, result: unknown) => void
      ) => void
    ): () => void;
    getFlightResponse(): Promise<Response | null>;
  };
  export function useClient(): ReactServerClientContext;
}

declare module "@lazarv/react-server/config" {
  export type ReactServerConfig = any;
  export function loadConfig<T extends Record<string, unknown>>(
    initialConfig: T
  ): Promise<ReactServerConfig>;
  export function defineConfig<T extends Record<string, unknown>>(
    config: T
  ): ReactServerConfig;

  export function forRoot(config?: ReactServerConfig): ReactServerConfig;
  export function forChild(config?: ReactServerConfig): ReactServerConfig;
}

declare module "react-error-boundary" {
  import {
    Component,
    ComponentType,
    ErrorInfo,
    FunctionComponent,
    PropsWithChildren,
    ReactElement,
    ReactNode,
  } from "react";

  function FallbackRender(props: FallbackProps): ReactNode;

  export type FallbackProps = {
    error: any;
    resetErrorBoundary: (...args: any[]) => void;
  };

  type ErrorBoundarySharedProps = PropsWithChildren<{
    onError?: (error: Error, info: ErrorInfo) => void;
    onReset?: (
      details:
        | { reason: "imperative-api"; args: any[] }
        | { reason: "keys"; prev: any[] | undefined; next: any[] | undefined }
    ) => void;
    resetKeys?: any[];
  }>;

  export type ErrorBoundaryPropsWithComponent = ErrorBoundarySharedProps & {
    fallback?: never;
    FallbackComponent: ComponentType<FallbackProps>;
    fallbackRender?: never;
  };

  export type ErrorBoundaryPropsWithRender = ErrorBoundarySharedProps & {
    fallback?: never;
    FallbackComponent?: never;
    fallbackRender: typeof FallbackRender;
  };

  export type ErrorBoundaryPropsWithFallback = ErrorBoundarySharedProps & {
    fallback: ReactElement<
      unknown,
      string | FunctionComponent | typeof Component
    > | null;
    FallbackComponent?: never;
    fallbackRender?: never;
  };

  export type ErrorBoundaryProps =
    | ErrorBoundaryPropsWithFallback
    | ErrorBoundaryPropsWithComponent
    | ErrorBoundaryPropsWithRender;
}

declare module "@lazarv/react-server/error-boundary" {
  import type { ErrorBoundaryProps } from "react-error-boundary";

  export type ReactServerErrorBoundaryProps = React.PropsWithChildren<
    Omit<ErrorBoundaryProps, "fallback"> & {
      fallback?: React.ReactNode;
      component?: React.ComponentType<{ error?: Error }> | React.ReactNode;
    }
  >;
  const ErrorBoundary: React.FC<ReactServerErrorBoundaryProps>;
  export default ErrorBoundary;
}

declare module "@lazarv/react-server/memory-cache" {
  import type { ReactServerCache } from "@lazarv/react-server";

  export class MemoryCache implements ReactServerCache {
    get<T = unknown>(keys: string[]): Promise<T | undefined>;
    set<T = unknown>(keys: string[], value: T): Promise<void>;
    has(keys: string[]): Promise<boolean>;
    setExpiry(keys: string[], ttl: number): Promise<void>;
    hasExpiry(keys: string[], ttl: number): Promise<boolean>;
    delete(keys: string[]): Promise<void>;
  }

  export function useCache<T>(
    keys: string[],
    value: (() => Promise<T>) | T,
    ttl?: number,
    force?: boolean
  ): Promise<T>;
}

declare module "@lazarv/react-server/navigation" {
  type LinkProps<T> = React.PropsWithChildren<{
    to: __react_server_routing__.ReactServerRouting<T>["path"];
    target?: string;
    transition?: boolean;
    push?: boolean;
    replace?: boolean;
    prefetch?: boolean;
    ttl?: number;
    rollback?: number;
    onNavigate?: () => void;
    onError?: (error: unknown) => void;
  }> &
    React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLAnchorElement>,
      HTMLAnchorElement
    >;
  export function Link<T extends string = string>(
    props: LinkProps<T>
  ): JSX.Element;

  type RefreshProps = React.PropsWithChildren<{
    url?: string;
    outlet?: string;
    transition?: boolean;
    prefetch?: boolean;
    ttl?: number;
    onRefresh?: () => void;
    onError?: (error: unknown) => void;
  }> &
    React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLAnchorElement>,
      HTMLAnchorElement
    >;
  export function Refresh(props: RefreshProps): JSX.Element;

  export function useLocation(): Location | null;
  export function useSearchParams(): URLSearchParams | null;
  export function usePathname(): string | null;
}

declare namespace __react_server_routing__ {
  interface ReactServerRouting<T = any, P = Record<string, any> | null> {
    path: T;
    params: P | null;
  }
}

declare module "@lazarv/react-server/router" {
  export type RouteParams =
    __react_server_routing__.ReactServerRouting["params"];
  export type RouteMatchers = Record<string, (value: string) => boolean>;

  export const ClientOnly: React.FC<React.PropsWithChildren>;
  export const Route: React.FC<
    React.PropsWithChildren<{
      path: string;
      exact?: boolean;
      matchers?: RouteMatchers;
      element?: React.ReactElement;
      render?: (
        props: React.PropsWithChildren<RouteParams>
      ) => React.ReactElement;
      standalone?: boolean;
      fallback?: boolean;
    }>
  >;

  export type ActionState<T, E> = {
    formData: FormData | null;
    data: T | null;
    error: E | null;
    actionId: string | null;
  };
  export function useActionState<
    T extends (
      ...args: any[]
    ) => T extends (...args: any[]) => infer R ? R : any,
    E = Error,
  >(action: T): ActionState<ReturnType<T>, E>;

  export type MatchOptions = {
    exact?: boolean;
    fallback?: boolean;
    matchers?: RouteMatchers;
  };
  export function useMatch<T = RouteParams>(
    path: __react_server_routing__.ReactServerRouting<T>["path"],
    options?: MatchOptions
  ): __react_server_routing__.ReactServerRouting<T>["params"] | null;
}

declare module "@lazarv/react-server/dev" {
  import * as http from "node:http";
  import type { Connect, WebSocketServer } from "vite";

  export function reactServer(
    root: string,
    options?: Record<string, any>
  ): Promise<{
    listen: () => http.Server;
    close: () => Promise<void>;
    ws: WebSocketServer;
    middlewares: Connect.Server;
  }>;
}

declare module "@lazarv/react-server/node" {
  import type { NodeMiddleware } from "@hattip/adapter-node";

  function reactServer(options?: Record<string, any>): Promise<{
    middlewares: NodeMiddleware;
  }>;
  export function reactServer(
    root?: string,
    options?: {
      cors?: boolean;
      origin?: string;
      https?: boolean;
      host?: string;
      port?: number;
      trustProxy?: boolean;
    }
  ): Promise<{
    middlewares: NodeMiddleware;
  }>;
}

declare module "@lazarv/react-server/prerender" {
  export function usePrerender(reason?: string): void;
  export function withPrerender<T extends React.FC>(Component: T): T;
}
