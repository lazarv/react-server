"use client";

import ErrorButton from "@/components/ErrorButton";
import Html from "@/components/Html";
import { type ErrorBoundaryComponentProps } from "@lazarv/react-server/error-boundary";
import { Refresh } from "@lazarv/react-server/navigation";

export default function GlobalError({ error }: ErrorBoundaryComponentProps) {
  return (
    <Html>
      <div className="w-screen h-screen p-16 flex flex-col items-center justify-center text-red-500">
        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-bold">
            {error.digest && error.digest !== error.message
              ? error.digest
              : error.message || "Global Error"}
          </h1>
          <p>An error occurred while loading the page.</p>
          {error.stack && (
            <pre className="w-full p-4 rounded-md bg-gray-100 whitespace-normal break-words italic">
              {error?.stack}
            </pre>
          )}
          <Refresh root noCache>
            <ErrorButton>Retry</ErrorButton>
          </Refresh>
        </div>
      </div>
    </Html>
  );
}
