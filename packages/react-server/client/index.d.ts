/**
 * The client context.
 *
 * @property refresh - Refreshes the current route
 * @property prefetch - Prefetches a route
 * @property navigate - Navigates to a route
 * @property replace - Replaces the current route
 */
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

/**
 * A hook that returns the client context.
 *
 * @returns The client context
 */
export function useClient(): ReactServerClientContext;

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
