"use client";

import { useClient } from "@lazarv/react-server/client";
import { useContext, useEffect } from "react";
import { ErrorBoundary, useErrorBoundary } from "react-error-boundary";

import { FlightContext } from "./FlightContext.mjs";

function ResetErrorBoundary() {
  const { url, outlet } = useContext(FlightContext);
  const { resetBoundary } = useErrorBoundary();
  const { subscribe } = useClient();

  useEffect(() => {
    return subscribe(outlet || url, () => resetBoundary());
  }, []);

  return null;
}

/**
 * @typedef {import("react").PropsWithChildren<Omit<import("react-error-boundary").ErrorBoundaryProps, 'fallback'> & { fallback: import("react").ReactNode }>} ReactServerErrorBoundaryProps
 * @param { ReactServerErrorBoundaryProps } props
 */
export default function ReactServerErrorBoundary({
  component: FallbackComponent,
  render: fallbackRender,
  children,
  ...props
}) {
  return (
    <ErrorBoundary
      {...props}
      fallbackRender={(props) => (
        <>
          <ResetErrorBoundary />
          {FallbackComponent && <FallbackComponent {...props} />}
          {fallbackRender?.(props)}
        </>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
