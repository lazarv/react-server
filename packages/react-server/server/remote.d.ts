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
 * import RemoteComponent from '@lazarv/react-server/remote';
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
