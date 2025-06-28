"use server";

import { createResource } from "@lazarv/react-server/mcp";

export const echo = createResource({
  id: "echo",
  template: "echo://{message}",
  title: "Echo",
  description: "Echo the input back",
  mimeType: "text/plain",
  async handler({ message }) {
    return `🔊 Echo: ${message}`;
  },
});
