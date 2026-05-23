"use client";

import { ClientOnly, useClient } from "@lazarv/react-server/client";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { useMemo } from "react";

// Import the generated route tree
import { routeTree } from "../routeTree.gen";

function createAppRouter() {
  return createRouter({ routeTree });
}

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}

function TanStackRouter({
  outlets,
}: {
  outlets: Record<string, React.ReactNode>;
}) {
  const client = useClient();
  const router = useMemo(() => createAppRouter(), []);

  return <RouterProvider router={router} context={{ client, outlets }} />;
}

// Render the app
export default function App({
  outlets,
}: {
  outlets: Record<string, React.ReactNode>;
}) {
  return (
    <ClientOnly>
      <TanStackRouter outlets={outlets} />
    </ClientOnly>
  );
}
