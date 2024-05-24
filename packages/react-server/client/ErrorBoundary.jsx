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
          {FallbackComponent && typeof FallbackComponent === "function" ? (
            <FallbackComponent {...props} />
          ) : (
            FallbackComponent
          )}
          {fallbackRender?.(props)}
        </>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
