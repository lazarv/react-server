"use server";

import { createTool } from "@lazarv/react-server/mcp";
import { z } from "zod";

export const echo = createTool({
  id: "echo",
  title: "Echo",
  description: "Echo the input back",
  inputSchema: {
    message: z.string().min(1, "Message cannot be empty"),
  },
  async handler({ message }) {
    return `🔊 Echo: ${message}`;
  },
});
