"use client";

import { use, useEffect, useState } from "react";

import { now } from "./data.mjs";

// Client-side chrome around whatever the entry passes as `children`. Owns no
// fixture data — that lets the entry control whether the heavy sections render
// as server components (RSC variant) or as client components (SSR shortcut
// variant) just by choosing where it composes the tree.
export default function App({ children }) {
  // `now()` is a `"use cache: request"` function. The use-cache-inline plugin
  // compiles it into a SYNCHRONOUS wrapper on the SSR/client side that reads
  // from the request-scoped shared cache. During SSR, render-dom.mjs flushes
  // resolved cache entries into the HTML stream as
  // `self.__react_server_request_cache_entries__` so the browser-side wrapper
  // resolves it synchronously during hydration — no async client component.
  const [time, setTime] = useState(use(now()));

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">@lazarv/react-server</h1>
            <p className="text-sm text-gray-500 mt-1">
              SPA benchmark fixture — heavy client tree
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Now</p>
            <p className="font-mono text-lg">{time.toLocaleTimeString()}</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-12">{children}</main>

      <footer className="bg-white border-t mt-12">
        <div className="max-w-6xl mx-auto px-6 py-6 text-center text-sm text-gray-500">
          Built with @lazarv/react-server
        </div>
      </footer>
    </div>
  );
}
