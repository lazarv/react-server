"use server";

import { createTool } from "@lazarv/react-server/mcp";
import { z } from "zod";

export default createTool({
  id: "roll-dice",
  title: "Roll Dice",
  description: "Roll a dice and return the result",
  inputSchema: {
    sides: z.number().int().min(2).max(100).default(6),
  },
  async handler({ sides }) {
    const value = Math.floor(Math.random() * sides) + 1;
    return `🎲 You rolled a ${value}!`;
  },
});
