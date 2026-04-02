"use client";

import { usePathname } from "@lazarv/react-server/navigation";

export default function UserNotFound() {
  const pathname = usePathname();
  return (
    <div
      style={{ padding: "1rem", border: "1px solid orange", borderRadius: 8 }}
    >
      <h2>User Not Found</h2>
      <p>
        No user route matched <code>{pathname}</code>.
      </p>
      <p style={{ color: "gray" }}>
        This is a <strong>scoped fallback</strong> — it only catches unmatched
        paths under <code>/user/</code>.
      </p>
    </div>
  );
}
