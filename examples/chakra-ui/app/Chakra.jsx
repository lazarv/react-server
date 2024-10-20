"use client";

import { Button, Spinner } from "@chakra-ui/react";
export { Button, Spinner };

export function AlertButton({ children }) {
  return <Button onClick={() => alert("Hello Chakra UI!")}>{children}</Button>;
}
