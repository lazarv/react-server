"use client";

export default function CustomErrorBoundary({ error }) {
  return <pre data-testid="error-stack">{error.stack}</pre>;
}
