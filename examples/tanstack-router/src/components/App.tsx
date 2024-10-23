"use client";

import { useClient } from "@lazarv/react-server/client";
import { createRouter, RouterProvider } from "@tanstack/react-router";

// Import the generated route tree
import { routeTree } from "../routeTree.gen";

// Create a new router instance
const router = createRouter({ routeTree });

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Render the app
export default function App({
  outlets,
}: {
  outlets: Record<string, React.ReactNode>;
}) {
  const client = useClient();

  return <RouterProvider router={router} context={{ client, outlets }} />;
}
