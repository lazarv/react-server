import { Suspense } from "react";

import ErrorBoundary from "@lazarv/react-server/client/ErrorBoundary.jsx";

export default async function ReactServerErrorBoundary({
  fallback = null,
  children,
  ...props
}) {
  return (
    <Suspense fallback={fallback}>
      <ErrorBoundary {...props}>{children}</ErrorBoundary>
    </Suspense>
  );
}
