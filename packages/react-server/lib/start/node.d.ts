import type { NodeMiddleware } from "@hattip/adapter-node";

/**
 * Use \@lazarv/react-server as a middleware in a Node.js server.
 *
 * @param options - Options for the server, same as the options for the react-server CLI command
 */
export function reactServer(options?: Record<string, any>): Promise<{
  middlewares: NodeMiddleware;
}>;

/**
 * Use \@lazarv/react-server as a middleware in a Node.js server.
 *
 * @param root - Entry point of the React application
 * @param options - Options for the server, same as the options for the react-server CLI command
 */
export function reactServer(
  root?: string,
  options?: {
    outDir?: string;
    cors?: boolean;
    origin?: string;
    https?: boolean;
    host?: string;
    port?: number;
    trustProxy?: boolean;
  }
): Promise<{
  middlewares: NodeMiddleware;
}>;
