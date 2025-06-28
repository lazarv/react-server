"use server";

import { createPrompt } from "@lazarv/react-server/mcp";
import { z } from "zod";

export const reviewCode = createPrompt({
  id: "review-code",
  title: "Review Code",
  description: "Review code for best practices and potential issues",
  argsSchema: { code: z.string() },
  handler: ({ code }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Please review this code:\n\n${code}`,
        },
      },
    ],
  }),
});
