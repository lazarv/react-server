import type { RequestContextExtensions } from "@hattip/compose";
import type { CookieSerializeOptions } from "@hattip/cookie";
import type { AdapterRequestContext } from "@hattip/core";

/**
 * This function enables caching the response for the specified time-to-live (TTL).
 * If the TTL is not specified, the cache will be stored indefinitely.
 * This higher-order component (HOC) is just a wrapper to use the `useResponseCache` hook as a HOC.
 *
 * @param Component - The component to cache
 * @param ttl - The time-to-live (TTL) in milliseconds
 *
 * @example
 *
 * ```tsx
 * import { withCache } from '@lazarv/react-server';
 *
 * function App() {
 *  return <>{Math.random()}</>;
 * }
 *
 * export default withCache(App, 3000);
 * ```
 */
export function withCache<T extends React.FC>(
  Component: T,
  ttl?: number | true
): T;

/**
 * This hook enables caching the response for the specified time-to-live (TTL).
 * If the TTL is not specified, the cache will be stored indefinitely.
 *
 * @param ttl - The time-to-live (TTL) in milliseconds
 *
 * @example
 *
 * ```tsx
 * import { useResponseCache } from '@lazarv/react-server';
 *
 * export default function App() {
 *  useResponseCache(3000);
 *  return <>{Math.random()}</>;
 * }
 * ```
 */
export function useResponseCache(ttl?: number): void;

/**
 * Redirects the request to the specified URL.
 *
 * @param url - The URL to redirect to
 * @param status - The status code to use for the redirect
 *
 * @example
 *
 * ```tsx
 * import { redirect } from '@lazarv/react-server';
 *
 * export default function App() {
 *  if (condition) {
 *   redirect('/login');
 *  }
 *
 *  // ...
 * }
 * ```
 */
export function redirect(url: string, status?: number): void;

/**
 * This hook returns the current request context, including the request, response, URL and method.
 *
 * @returns The current request context
 */
export function useHttpContext(): AdapterRequestContext;

/**
 * This hook returns the current request object.
 *
 * @returns The current request object
 */
export function useRequest(): Request;

/**
 * This hook returns the current response object.
 *
 * @returns The current response object
 */
export function useResponse(): Response;

/**
 * This hook returns the current URL object.
 *
 * @returns The current URL object
 *
 * @example
 *
 * ```tsx
 * import { useUrl } from '@lazarv/react-server';
 *
 * export default function App() {
 *  const url = useUrl();
 *  return <h1>{url.pathname}</h1>;
 * }
 * ```
 */
export function useUrl(): URL;

/**
 * This hook returns the current pathname.
 *
 * @returns The current pathname
 */
export function usePathname(): string;

/**
 * This hook returns the current search params.
 *
 * @returns The current search params as an object
 */
export function useSearchParams(): Record<string, string | string[]>;

/**
 * This hook returns the current form data if request Content-Type is application/x-www-form-urlencoded or multipart/form-data.
 *
 * @returns The current form data
 */
export function useFormData(): FormData;

/**
 * Rewrites the current request URL to the specified pathname.
 *
 * @param pathname - The new pathname to use
 */
export function rewrite(pathname: string): void;

/**
 * Revalidates the current request cache.
 *
 * @param key - The cache key to revalidate, if not specified, the key will be the current request URL
 */
export function revalidate(key?: string): void;

/**
 * Invalidates cached function.
 *
 * @param key - The cache key, compound key or cached function to invalidate.
 */
export function invalidate(key?: string): Promise<void>;
export function invalidate(key: string[]): Promise<void>;
export function invalidate<T extends (...args: any[]) => any>(
  fn: T
): Promise<void>;

/**
 * Sets the status code and status text of the response.
 *
 * @param status - The status code to set
 * @param statusText - The status text to set
 *
 * @example
 *
 * ```tsx
 * import { status } from '@lazarv/react-server';
 *
 * export default function NotFound() {
 *  status(404, 'Not Found');
 *  return <h1>404 Not Found</h1>;
 * }
 */
export function status(status?: number, statusText?: string): void;

/**
 * Get the request headers or set the response headers.
 *
 * @param headers - The headers to set
 *
 * @example
 *
 * ```tsx
 * import { headers } from '@lazarv/react-server';
 *
 * export default function App() {
 *  const requestHeaders = headers();
 *  return <p>{requestHeaders.get('user-agent')}</p>;
 * }
 * ```
 */
export function headers(headers?: Record<string, string>): void;

/**
 * Get the active outlet when using client navigation.
 *
 * @returns The outlet name or page root outlet name ("PAGE_ROOT")
 */
export function useOutlet(): string;

export type Cookies = RequestContextExtensions["cookie"];

/**
 * Get the request cookies.
 *
 * @returns The request cookies
 */
export function cookie(): Cookies;

/**
 * Set a cookie.
 *
 * @param name - The name of the cookie
 * @param value - The value of the cookie
 * @param options - The options for the cookie
 */
export function setCookie(
  name: string,
  value: string,
  options?: CookieSerializeOptions
): void;

/**
 * Delete a cookie.
 *
 * @param name - The name of the cookie
 * @param options - The options for the cookie
 */
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
