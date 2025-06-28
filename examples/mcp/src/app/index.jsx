import { echo } from "../mcp/resources/echo.mjs";
import rollDice from "../mcp/tools/roll-dice.mjs";
import Tools from "../components/tools.jsx";

export default async function App() {
  const message = await echo({ message: "Hello World" });
  const value = await rollDice({ sides: 100 });

  return (
    <>
      <h1>MCP Application</h1>
      <p>{message}</p>
      <p>{value}</p>
      <Tools />
    </>
  );
}
