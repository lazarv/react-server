import * as http from "node:http";
import type { Connect, WebSocketServer } from "vite";

/**
 * Use the @lazarv/react-server Vite development server as a middleware in a Node.js server.
 *
 * @param root - Entry point of the React application
 * @param options - Options for the server, same as the options for the react-server CLI command
 */
export function reactServer(
  root: string,
  options?: Record<string, any>
): Promise<{
  listen: () => http.Server;
  close: () => Promise<void>;
  ws: WebSocketServer;
  middlewares: Connect.Server;
}>;
