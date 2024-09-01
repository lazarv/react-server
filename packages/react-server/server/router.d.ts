export type RouteParams = Record<string, string>;
export type RouteMatchers = Record<string, (value: string) => boolean>;

/**
 * Represents a route in the application.
 *
 * @property path - The path of the route
 * @property exact - If true, the path must match exactly
 * @property matchers - Custom matchers for route parameters
 * @property element - The element to render for the route
 * @property render - A function that returns the element to render for the route
 * @property standalone - If true, the route is standalone, only rendered when client requests a full page reload
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
    standalone?: boolean;
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

/**
 * Loads a remote component from the given URL. The component is fetched and rendered on the server side and if contains any client components, they are hydrated on the client side. For client components to work properly, you might need to use an import map. If the component is streamed, use the `defer` option to re-fetch the component after the initial render on the client side.
 *
 * @param src The URL of the remote component
 * @param ttl The time-to-live for the component, the remote component is cached for the given time
 * @param defer If true, the component is re-fetched after the initial render on the client side
 * @param request The request options for the fetch request
 * @param onError The error handler for the fetch request
 *
 * @example
 *
 * ```tsx
 * import { RemoteComponent } from '@lazarv/react-server/router';
 *
 * export default function App() {
 *   return (
 *     <>
 *       <h1>App</h1>
 *       <RemoteComponent src="https://example.com/remote-component" />
 *    </>
 *  );
 * }
 */
export const RemoteComponent: React.FC<{
  src: string;
  ttl?: number;
  defer?: boolean;
  request?: RequestInit;
  onError?: (error: Error) => void;
}>;
