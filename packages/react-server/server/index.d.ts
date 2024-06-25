import type { RequestContextExtensions } from "@hattip/compose";
import type { CookieSerializeOptions } from "@hattip/cookie";
import type { AdapterRequestContext } from "@hattip/core";

export function withCache<T extends React.FC>(
  Component: T,
  ttl?: number | true
): T;

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
 * @param key - The cache key to revalidate
 */
export function revalidate(key?: string): void;

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
