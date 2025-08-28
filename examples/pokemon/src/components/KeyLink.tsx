"use client";

import { useEffect } from "react";

import { useClient } from "@lazarv/react-server/client";
import { Link, type LinkProps } from "@lazarv/react-server/navigation";

export default function KeyLink<T>({
  to,
  eventKey,
  target,
  fallback,
  revalidate,
  children,
  ...props
}: LinkProps<__react_server_routing__.RouteImpl<T>> & { eventKey: string }) {
  const { navigate } = useClient();

  useEffect(() => {
    const abortController = new AbortController();

    document.addEventListener(
      "keydown",
      (event) => {
        if (
          document.activeElement?.tagName !== "INPUT" &&
          event.key === eventKey &&
          to !== "#" &&
          (to === "/" || (to !== "/" && !location.href.includes(to)))
        ) {
          navigate(to, {
            outlet: target,
            push: true,
            fallback,
            revalidate,
          });
        }
      },
      { signal: abortController.signal }
    );

    return () => abortController.abort();
  }, [to]);

  return (
    <Link
      to={to}
      push
      target={target}
      fallback={fallback}
      revalidate={revalidate}
      {...props}
    >
      {children}
    </Link>
  );
}
