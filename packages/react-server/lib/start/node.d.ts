import type { NodeMiddleware } from "@hattip/adapter-node";

export interface ReactServerOptions {
  outDir?: string;
  cors?: boolean;
  origin?: string;
  https?: boolean;
  host?: string;
  port?: number;
  trustProxy?: boolean;
}

/**
 * Use \@lazarv/react-server as a middleware in a Node.js server.
 *
 * @param options - Options for the server, same as the options for the react-server CLI command
 * @param initialConfig - Initial configuration for the application
 */
export function reactServer(
  options?: ReactServerOptions,
  initialConfig?: Record<string, any>
): Promise<{
  middlewares: NodeMiddleware;
}>;

/**
 * Use \@lazarv/react-server as a middleware in a Node.js server.
 *
 * @param root - Entry point of the React application
 * @param options - Options for the server, same as the options for the react-server CLI command
 * @param initialConfig - Initial configuration for the application
 */
export function reactServer(
  root?: string,
  options?: ReactServerOptions,
  initialConfig?: Record<string, any>
): Promise<{
  middlewares: NodeMiddleware;
}>;
