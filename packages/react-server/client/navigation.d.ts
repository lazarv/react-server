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
export function Link<T extends string>(props: LinkProps<T>): JSX.Element;

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
export function Refresh(props: RefreshProps): JSX.Element;

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
export function Form(props: FormProps): JSX.Element;

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
): JSX.Element;

/**
 * A hook that returns the current location.
 *
 * @param outlet - which outlet to watch (optional, defaults to root)
 * @returns The current location
 */
export function useLocation(outlet?: string): Location | null;

/**
 * A hook that returns the current search parameters.
 *
 * @param outlet - which outlet to watch (optional, defaults to root)
 * @returns The current search parameters
 */
export function useSearchParams(outlet?: string): URLSearchParams | null;

/**
 * A hook that returns the current pathname.
 *
 * @param outlet - which outlet to watch (optional, defaults to root)
 * @returns The current pathname
 */
export function usePathname(outlet?: string): string | null;
