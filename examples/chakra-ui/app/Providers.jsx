"use client";

import { ChakraProvider } from "@chakra-ui/react";

export default function Providers({ children }) {
  return <ChakraProvider>{children}</ChakraProvider>;
}
