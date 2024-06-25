/**
 * The props for the `Link` component.
 *
 * @property to - The route to link to
 * @property target - The target for the link
 * @property transition - If true, the link will use React useTransition
 * @property push - If true, the link will push the route to the history stack
 * @property replace - If true, the link will replace the current route in the history stack
 * @property prefetch - If true, the link will be prefetched on mouse or touch events
 * @property ttl - The time-to-live for the prefetch
 * @property rollback - The time-to-live for in case of a back navigation
 * @property onNavigate - A callback that is called when the navigation is complete
 * @property onError - A callback that is called when the link fails
 */
export type LinkProps<T> = React.PropsWithChildren<{
  to: T;
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
export function Link<T extends string>(props: LinkProps<T>): JSX.Element;

/**
 * The props for the `Refresh` component.
 *
 * @property url - The URL to refresh
 * @property outlet - The outlet to refresh
 * @property transition - If true, the refresh will use React useTransition
 * @property prefetch - If true, the refresh will be prefetched on mouse or touch events
 * @property ttl - The time-to-live for the prefetch
 * @property onRefresh - A callback that is called when the refresh is complete
 * @property onError - A callback that is called when the refresh fails
 */
export type RefreshProps = React.PropsWithChildren<{
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

/**
 * A hook that returns the current location.
 *
 * @returns The current location
 */
export function useLocation(): Location | null;

/**
 * A hook that returns the current search parameters.
 *
 * @returns The current search parameters
 */
export function useSearchParams(): URLSearchParams | null;

/**
 * A hook that returns the current pathname.
 *
 * @returns The current pathname
 */
export function usePathname(): string | null;
