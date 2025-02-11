"use client";

import { usePathname, useSearchParams } from "@lazarv/react-server/navigation";

export default function Location() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <pre>
      {pathname}
      {JSON.stringify(searchParams)}
    </pre>
  );
}
