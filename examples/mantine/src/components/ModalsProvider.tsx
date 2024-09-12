"use client";

import { ModalsProvider } from "@mantine/modals";

export default function ModalsProviderDemo({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ModalsProvider>{children}</ModalsProvider>;
}
