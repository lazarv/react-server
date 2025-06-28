import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
export { completable } from "@modelcontextprotocol/sdk/server/completable.js";

import { context$, getContext } from "./context.mjs";

export const MCP_INIT_DATA = Symbol("MCP_INIT_DATA");

export function createTool(tool) {
  if (typeof tool !== "object" || !tool.id) {
    throw new Error("Tool must be an object with an 'id' property");
  }

  if (!tool.inputSchema) {
    throw new Error("Tool must have an 'inputSchema' property");
  }

  if (typeof tool.handler !== "function") {
    throw new Error("Tool must have a 'handler' function");
  }

  Object.defineProperty(tool.handler, MCP_INIT_DATA, {
    value: tool,
  });

  return tool.handler;
}

export function createResource(resource) {
  if (typeof resource !== "object" || !resource.id) {
    throw new Error("Resource must be an object with an 'id' property");
  }

  if (!resource.template) {
    throw new Error("Resource must have a 'template' property");
  }

  if (typeof resource.handler !== "function") {
    throw new Error("Resource must have a 'handler' function");
  }

  Object.defineProperty(resource.handler, MCP_INIT_DATA, {
    value: resource,
  });

  return resource.handler;
}

export function createPrompt(prompt) {
  if (typeof prompt !== "object" || !prompt.id) {
    throw new Error("Prompt must be an object with an 'id' property");
  }

  if (!prompt.argsSchema) {
    throw new Error("Prompt must have an 'argsSchema' property");
  }

  if (typeof prompt.handler !== "function") {
    throw new Error("Prompt must have a 'handler' function");
  }

  Object.defineProperty(prompt.handler, MCP_INIT_DATA, {
    value: prompt,
  });

  return prompt.handler;
}

const MCP_SERVER = Symbol("MCP_SERVER");
export function useMCPServer() {
  return getContext(MCP_SERVER);
}

export function isMCPCall() {
  const server = useMCPServer();
  return server && server instanceof McpServer;
}

export function createServer({
  prompts = [],
  resources = [],
  tools = [],
  ...serverOptions
}) {
  return async (context) => {
    const server = new McpServer({
      name: "mcp",
      version: "0.0.0",
      title: "MCP Server",
      ...serverOptions,
    });
    context$(MCP_SERVER, server);

    const toolsArray = Array.isArray(tools) ? tools : Object.values(tools);
    for (const tool of toolsArray) {
      if (typeof tool !== "function") {
        throw new Error("Tool must be a function");
      }

      const initData = tool[MCP_INIT_DATA];
      if (!initData) {
        throw new Error("Tool must have MCP_INIT_DATA property");
      }

      const { id, handler, ...toolOptions } = initData;

      server.registerTool(
        id,
        {
          ...toolOptions,
        },
        async (...args) => {
          const result = await handler(...args);

          if (typeof result === "string") {
            return {
              content: [
                {
                  type: "text",
                  text: result,
                },
              ],
            };
          }

          return result;
        }
      );
    }

    const resourcesArray = Array.isArray(resources)
      ? resources
      : Object.values(resources);
    for (const resource of resourcesArray) {
      if (typeof resource !== "function") {
        throw new Error("Resource must be a function");
      }

      const initData = resource[MCP_INIT_DATA];
      if (!initData) {
        throw new Error("Resource must have MCP_INIT_DATA property");
      }

      const { id, template, handler, list, complete, ...resourceOptions } =
        initData;

      server.registerResource(
        id,
        /\{[^{}]+\}/.test(template)
          ? new ResourceTemplate(template, { list, complete })
          : template,
        {
          ...resourceOptions,
        },
        async (uri, args) => {
          const result = await handler(args);

          if (typeof result === "string") {
            return {
              contents: [
                {
                  uri: uri.href,
                  text: result,
                },
              ],
            };
          }

          return result;
        }
      );
    }

    const promptsArray = Array.isArray(prompts)
      ? prompts
      : Object.values(prompts);
    for (const prompt of promptsArray) {
      if (typeof prompt !== "function") {
        throw new Error("Prompt must be a function");
      }

      const initData = prompt[MCP_INIT_DATA];
      if (!initData) {
        throw new Error("Prompt must have MCP_INIT_DATA property");
      }

      const { id, handler, ...promptOptions } = initData;
      server.registerPrompt(id, promptOptions, async (args) => {
        const result = await handler(args);

        if (typeof result === "string") {
          return {
            contents: [
              {
                type: "text",
                text: result,
              },
            ],
          };
        }

        return result;
      });
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);

    let statusCode = 200;
    const headers = new Headers();
    let body = "";

    if (context.request.body) {
      const decoder = new TextDecoder();
      for await (const chunk of context.request.body) {
        body += decoder.decode(chunk);
      }
    }

    let startStream;
    const promise = new Promise((resolve) => {
      startStream = resolve;
    });
    const onClose = [];
    const stream = new ReadableStream({
      async start(controller) {
        await transport.handleRequest(
          {
            method: context.request.method,
            url: context.request.url,
            headers: Object.fromEntries(context.request.headers),
          },
          {
            writeHead(_statusCode, _headers) {
              statusCode = _statusCode;
              if (_headers) {
                for (const [key, value] of Object.entries(_headers)) {
                  headers.set(key, value);
                }
              }
              return this;
            },
            end(chunk) {
              if (chunk) {
                controller.enqueue(chunk);
                controller.close();
                onClose.forEach((callback) => callback());
              }
              startStream();
            },
            on(event, callback) {
              if (event === "close") {
                onClose.push(callback);
              }
            },
            write(chunk) {
              if (chunk) {
                controller.enqueue(chunk);
              }
            },
            flushHeaders() {
              startStream();
            },
          },
          body ? JSON.parse(body) : undefined
        );
      },
    });
    await promise;

    return new Response(stream, {
      status: statusCode,
      headers,
    });
  };
}
