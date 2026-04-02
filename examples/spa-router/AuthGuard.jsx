"use client";

import { useState, useCallback } from "react";
import { useNavigationGuard } from "@lazarv/react-server/navigation";
import { AuthProvider } from "./auth-context.jsx";

/**
 * Example: navigation guard that protects routes behind authentication.
 * Wrap your app (or a subtree) with this component.
 */
export default function AuthGuard({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const guard = useCallback(
    (from, to) => {
      if (!isAuthenticated && to.startsWith("/dashboard")) {
        // Redirect unauthenticated users to home
        return "/";
      }
    },
    [isAuthenticated]
  );

  useNavigationGuard(guard);

  return (
    <AuthProvider value={isAuthenticated}>
      <div>
        <div
          style={{
            padding: "0.5rem 1rem",
            marginBottom: "1rem",
            background: isAuthenticated ? "#d4edda" : "#f8d7da",
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            gap: "1rem",
          }}
        >
          <span>{isAuthenticated ? "🔓 Logged in" : "🔒 Not logged in"}</span>
          <button onClick={() => setIsAuthenticated(!isAuthenticated)}>
            {isAuthenticated ? "Log out" : "Log in"}
          </button>
          <span style={{ fontSize: 12, color: "#666" }}>
            (Dashboard &amp; Protected are guarded — try navigating while logged
            out)
          </span>
        </div>
        {children}
      </div>
    </AuthProvider>
  );
}
