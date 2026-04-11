"use client";

import { useState, useCallback } from "react";
import { redirect, useNavigationGuard } from "@lazarv/react-server/navigation";
import { useAuth } from "./auth-context.jsx";

/**
 * Example: a client component that uses redirect() during render
 * as an enter guard, and useNavigationGuard with beforeUnload as
 * a leave guard to protect unsaved changes.
 */
export default function ProtectedPage() {
  const isAuthenticated = useAuth();

  if (!isAuthenticated) {
    redirect("/");
  }

  const [dirty, setDirty] = useState(false);

  const guard = useCallback(() => {
    if (dirty) {
      return confirm("You have unsaved changes. Leave this page?");
    }
  }, [dirty]);

  // Client-side nav → runs the guard callback (shows confirm dialog).
  // Tab close / external nav → browser's native "Leave site?" dialog.
  useNavigationGuard(guard, { beforeUnload: dirty });

  return (
    <div style={{ padding: "1rem", background: "#d4edda", borderRadius: 4 }}>
      <h2>Protected Content</h2>
      <p>You can only see this when logged in.</p>
      <p style={{ marginTop: "1rem", fontSize: 14, color: "#555" }}>
        Try editing the textarea below, then navigate away or close the tab.
      </p>
      <textarea
        rows={4}
        cols={50}
        placeholder="Type something to make the form dirty..."
        onChange={() => setDirty(true)}
        style={{
          display: "block",
          marginTop: "0.5rem",
          padding: "0.5rem",
          borderRadius: 4,
          border: "1px solid #ccc",
        }}
      />
      {dirty && (
        <p style={{ marginTop: "0.5rem", color: "#856404", fontSize: 13 }}>
          ⚠️ Unsaved changes — navigation is guarded
        </p>
      )}
    </div>
  );
}
