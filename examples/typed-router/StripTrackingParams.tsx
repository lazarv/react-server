"use client";

import type { SearchParamsProps } from "@lazarv/react-server/router";
import { SearchParams } from "@lazarv/react-server/router";

function decode(sp: URLSearchParams) {
  const cleaned = new URLSearchParams(sp);
  for (const key of Array.from(cleaned.keys())) {
    if (key.startsWith("utm_") || key === "fbclid") {
      cleaned.delete(key);
    }
  }
  return cleaned;
}

export default function StripTrackingParams({ children }: SearchParamsProps) {
  return <SearchParams decode={decode}>{children}</SearchParams>;
}
