"use client";

import { createPortal } from "react-dom";

import { ClientOnly } from "@lazarv/react-server/client";

export default function Loading() {
  const fallback = (
    <div className="flex p-16 pb-8 items-center justify-center text-2xl font-bold text-blue-600">
      Loading...
    </div>
  );

  if (typeof document === "undefined") {
    return fallback;
  }

  return (
    <>
      {fallback}
      <ClientOnly>
        {createPortal(
          <div className="fixed h-16 top-0 left-1/2 -translate-x-1/2 flex items-center gap-1 z-50">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-blue-600"
                style={{
                  animation: `dotFade 1.5s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </div>,
          document.body
        )}
      </ClientOnly>
    </>
  );
}
