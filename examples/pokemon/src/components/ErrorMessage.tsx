"use client";

import ErrorButton from "@/components/ErrorButton";
import { type ErrorBoundaryComponentProps } from "@lazarv/react-server/error-boundary";

export default function Error({
  error,
  resetErrorBoundary,
}: ErrorBoundaryComponentProps) {
  return (
    <div className="w-full h-full p-16 pb-8 flex items-center justify-center text-red-500 z-10 animate-[fadeIn_0.2s_ease-in-out] after:content-none">
      <div className="flex flex-col gap-4 w-full">
        <h1 className="text-2xl font-bold">
          {error.digest && error.digest !== error.message
            ? error.digest
            : error.message || "Error"}
        </h1>
        <p className="text-sm">An error occurred while loading the page.</p>
        {error.stack && (
          <pre className="text-xs max-w-full mb-2 p-2 rounded-md bg-gray-100 whitespace-normal break-words italic">
            {error.stack}
          </pre>
        )}
        <ErrorButton onClick={resetErrorBoundary}>Retry</ErrorButton>
      </div>
    </div>
  );
}
