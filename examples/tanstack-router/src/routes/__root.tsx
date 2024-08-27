import type { ReactServerClientContext } from "@lazarv/react-server/client";
import {
  createRootRouteWithContext,
  Link,
  Outlet,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";

export const Route = createRootRouteWithContext<{
  outlets: Record<string, React.ReactNode>;
  client: ReactServerClientContext;
}>()({
  pendingMinMs: 0,
  component: () => (
    <>
      <nav className="bg-gray-800 p-4">
        <div className="container mx-auto flex justify-between items-center">
          <div className="text-white font-bold text-xl">My App</div>
          <div className="flex space-x-4">
            <Link
              to="/"
              className="text-gray-300 hover:bg-gray-700 hover:text-white px-3 py-2 rounded-md text-sm font-medium [&.active]:bg-gray-900 [&.active]:text-white"
            >
              Home
            </Link>
            <Link
              to="/posts"
              className="text-gray-300 hover:bg-gray-700 hover:text-white px-3 py-2 rounded-md text-sm font-medium [&.active]:bg-gray-900 [&.active]:text-white"
            >
              Posts
            </Link>
            <Link
              to="/about"
              className="text-gray-300 hover:bg-gray-700 hover:text-white px-3 py-2 rounded-md text-sm font-medium [&.active]:bg-gray-900 [&.active]:text-white"
            >
              About
            </Link>
          </div>
        </div>
      </nav>
      <hr />
      <div className="p-2">
        <Outlet />
      </div>
      <TanStackRouterDevtools />
    </>
  ),
});
