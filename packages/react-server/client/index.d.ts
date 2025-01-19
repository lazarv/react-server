/**
 * The client context.
 *
 * @property refresh - Refreshes the current route
 * @property prefetch - Prefetches a route
 * @property navigate - Navigates to a route
 * @property replace - Replaces the current route
 * @property getFlightResponse - Returns the flight response for a route
 */
export type ReactServerClientContext = {
  registerOutlet(outlet: string, url: string): void;
  refresh(
    outlet?: string,
    options?: {
      signal?: AbortSignal;
      fallback?: React.ReactNode;
      Component?: React.ReactNode;
    }
  ): Promise<void>;
  prefetch(
    url: string,
    options?: {
      outlet?: string;
      ttl?: number;
      signal?: AbortSignal;
    }
  ): Promise<void>;
  navigate(
    url: string,
    options?: {
      outlet?: string;
      push?: boolean;
      rollback?: number;
      signal?: AbortSignal;
      fallback?: React.ReactNode;
      Component?: React.ReactNode;
    }
  ): Promise<void>;
  replace(
    url: string,
    options?: {
      outlet?: string;
      rollback?: number;
      signal?: AbortSignal;
      fallback?: React.ReactNode;
      Component?: React.ReactNode;
    }
  ): Promise<void>;
  abort(outlet?: string, reason?: unknown): void;
  subscribe(
    url: string,
    listener: (
      to: string,
      done?: (err: unknown | null, result: unknown) => void
    ) => void
  ): () => void;
  getFlightResponse(
    url: string,
    options?: { outlet?: string }
  ): Promise<React.ReactNode | null>;
};

/**
 * A hook that returns the client context.
 *
 * @returns The client context
 */
export function useClient(): ReactServerClientContext;

/**
 * The outlet context.
 *
 * @property navigate - Navigates to a route in the current outlet
 * @property abort - Aborts the navigation in the current outlet
 */
export type ReactServerOutletContext = {
  refresh: (
    options?: Parameters<ReactServerClientContext["refresh"]>[1]
  ) => Promise<void>;
  prefetch: (
    url: string,
    options?: Parameters<ReactServerClientContext["prefetch"]>[1]
  ) => Promise<void>;
  navigate: (
    to: string,
    options?: Parameters<ReactServerClientContext["navigate"]>[1]
  ) => Promise<void>;
  replace: (
    to: string,
    options?: Parameters<ReactServerClientContext["replace"]>[1]
  ) => Promise<void>;
  abort: (reason?: string) => void;
};

/**
 * A hook that returns the outlet context.
 *
 * @returns The outlet context
 */
export function useOutlet(): ReactServerOutletContext;

/**
 * A component that renders its children only on the client after hydration.
 *
 * @param props - The props for the component
 *
 * @returns The component
 *
 * @example
 *
 * ```tsx
 * import { ClientOnly } from '@lazarv/react-server/client';
 *
 * export default function App() {
 *  return (
 *   <ClientOnly>
 *    <h1>Client-only content</h1>
 *   </ClientOnly>
 *  );
 * }
 * ```
 */
export function ClientOnly(props: React.PropsWithChildren): JSX.Element;
