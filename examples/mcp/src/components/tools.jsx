"use client";

import { echo } from "../mcp/tools/echo.mjs";
import rollDice from "../mcp/tools/roll-dice.mjs";

export default function Tools() {
  return (
    <div>
      <h2>Tool Example</h2>
      <button
        onClick={async () => {
          const message = await echo({
            message: "Hello from the tool!",
          });
          alert(message);
        }}
      >
        Click me
      </button>
      <button
        onClick={async () => {
          const result = await rollDice({ sides: 6 });
          alert(result);
        }}
      >
        Roll a Dice
      </button>
    </div>
  );
}
