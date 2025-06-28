import { createServer } from "@lazarv/react-server/mcp";

import * as prompts from "../mcp/prompts/index.mjs";
import * as resources from "../mcp/resources/index.mjs";
import * as tools from "../mcp/tools/index.mjs";

export default createServer({
  prompts,
  resources,
  tools,
});
