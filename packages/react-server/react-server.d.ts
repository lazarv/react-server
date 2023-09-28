declare module "@lazarv/react-server" {
  import type { RequestContextExtensions } from "@hattip/compose";
  import type { CookieSerializeOptions } from "@hattip/cookie";

  export function server$<T extends (...args: any[]) => any>(action: T): T;
  export function cache$<T extends React.FC>(
    Component: T,
    ttl?: number | true
  ): T;
  export function redirect(url: string, status?: number): void;

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
}

declare module "@lazarv/react-server/client" {
  export type ReactServerClientContext = {
    registerOutlet(outlet: string, url: string): void;
    refresh(outlet?: string): Promise<void>;
    prefetch(
      url: string,
      options?: { outlet?: string; ttl?: number }
    ): Promise<void>;
    navigate(
      url: string,
      options?: { outlet?: string; push?: boolean; rollback?: number }
    ): Promise<void>;
    replace(
      url: string,
      options?: { outlet?: string; rollback?: number }
    ): Promise<void>;
    subscribe(
      url: string,
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

declare module "@lazarv/react-server/error-boundary" {
  import type { ErrorBoundaryProps } from "react-error-boundary";

  export type ReactServerErrorBoundaryProps = React.PropsWithChildren<
    Omit<ErrorBoundaryProps, "fallback"> & { fallback: React.ReactNode }
  >;
  const ErrorBoundary: React.FC<ReactServerErrorBoundaryProps>;
  export default ErrorBoundary;
}

declare module "@lazarv/react-server/memory-cache" {
  export interface ReactServerCache {
    get<T = unknown>(keys: string[]): Promise<T | undefined>;
    set<T = unknown>(keys: string[], value: T): Promise<void>;
    has(keys: string[]): Promise<boolean>;
    setExpiry(keys: string[], ttl: number): Promise<void>;
    hasExpiry(keys: string[], ttl: number): Promise<boolean>;
    delete(keys: string[]): Promise<void>;
  }

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
  import type { ReactServerRouting } from "@lazarv/react-server/router";

  export const Link: React.FC<
    React.PropsWithChildren<{
      to: ReactServerRouting["path"];
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
      >
  >;
  export const Refresh: React.FC<
    React.PropsWithChildren<{
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
      >
  >;
}

declare module "@lazarv/react-server/remote-component" {
  const RemoteComponent: React.FC<{
    url: string;
    outlet?: string;
    ttl?: number;
    request?: RequestInit;
  }>;
  export default RemoteComponent;
}

declare module "@lazarv/react-server/router" {
  interface ReactServerRouting {
    path: string;
  }

  export type RouteParams = Record<string, string | string[]>;
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
      remote?: boolean;
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
    path: string,
    options?: MatchOptions
  ): T | null;

  export function useParams<T = RouteParams>(): T;
}
