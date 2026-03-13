"use client";

import { usePathname } from "@lazarv/react-server/navigation";

export default function NotFound() {
  const pathname = usePathname();

  return (
    <div>
      <h2 style={{ color: "crimson" }}>404 — Page Not Found</h2>
      <p>
        No route matched <code>{pathname}</code>.
      </p>
      <p>
        This is a client-only fallback route created with{" "}
        <code>{'createRoute("*")'}</code>.
      </p>
    </div>
  );
}
