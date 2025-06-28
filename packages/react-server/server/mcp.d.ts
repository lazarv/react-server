import type { AdapterRequestContext } from "@hattip/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z, ZodTypeAny } from "zod";
export type { completable } from "@modelcontextprotocol/sdk/server/completable.js";

type InputSchemaShape = Record<string, ZodTypeAny>;

type ToolDefinition<S extends InputSchemaShape, R> = {
  id: string;
  title: string;
  description: string;
  inputSchema: S;
  handler: (input: {
    [K in keyof S]: z.infer<S[K]>;
  }) => Promise<R>;
};

/** Creates a tool that can be used in the Model Context Protocol (MCP).
 * The tool can be used to perform actions or retrieve data based on the provided input schema.
 * @param def - The definition of the tool, including its ID, title, description, input schema, and handler function.
 * @returns A function that takes input matching the schema and returns a promise that resolves to the result of the tool's action.
 */
export function createTool<S extends InputSchemaShape, R>(
  def: ToolDefinition<S, R>
): (input: { [K in keyof S]: z.infer<S[K]> }) => Promise<R>;

type ExtractParams<T extends string> =
  T extends `${string}{${infer Param}}${infer Rest}`
    ? Param | ExtractParams<Rest>
    : never;

type ParamsFromTemplate<T extends string> = {
  [K in ExtractParams<T>]: string;
};

type ResourceDefinition<T extends string & {}, R> = {
  id: string;
  template: T;
  list: undefined;
  complete?: {
    [K in ExtractParams<T>]?: (
      value: string,
      context?: {
        arguments?: Record<string, string>;
      }
    ) => string | Promise<string>;
  };
  title: string;
  description?: string;
  handler: (input: ParamsFromTemplate<T>) => Promise<R>;
};

/** Creates a resource that can be used in the Model Context Protocol (MCP).
 * The resource can be accessed using a template string, allowing for dynamic parameters.
 * @param def - The definition of the resource, including its ID, template, list function, optional completion functions for parameters, title, description, and handler function.
 * @returns A function that takes input matching the template parameters and returns a promise that resolves to the result of the resource's action.
 */
export function createResource<T extends string & {}, R>(
  def: ResourceDefinition<T, R>
): (input: ParamsFromTemplate<T>) => Promise<R>;

type PromptDefinition<S extends InputSchemaShape, R> = {
  id: string;
  title: string;
  description?: string;
  argsSchema?: S;
  handler: (input: {
    [K in keyof S]: z.infer<S[K]>;
  }) => Promise<R>;
};

/** Creates a prompt that can be used in the Model Context Protocol (MCP).
 * The prompt can be used to gather input from the user and return a result based on the provided input schema.
 * @param def - The definition of the prompt, including its ID, title, optional description, input schema, and handler function.
 * @returns A function that takes input matching the schema and returns a promise that resolves to the result of the prompt's action.
 */
export function createPrompt<S extends InputSchemaShape, R>(
  def: PromptDefinition<S, R>
): (input: {
  [K in keyof S]: z.infer<S[K]>;
}) => Promise<R>;

/** Creates a Model Context Protocol (MCP) server that can handle requests and responses.
 * The server can be configured with tools, resources, and prompts.
 * @param tools - An optional object containing tools defined using `createTool`.
 * @param resources - An optional object containing resources defined using `createResource`.
 * @param prompts - An optional object containing prompts defined using `createPrompt`.
 * @returns A function that takes an `AdapterRequestContext` and returns a promise that resolves to a `Response`. A `@lazarv/react-server` server middleware can use this function to handle requests.
 */
export function createServer<T, R, P>({
  tools,
  resources,
  prompts,
}: {
  tools?: T;
  resources?: R;
  prompts?: P;
}): (context: AdapterRequestContext) => Promise<Response>;

/** Retrieves the current Model Context Protocol (MCP) server from the request context.
 * This function is typically used within a server-side component to access the MCP server instance.
 * @returns The current MCP server instance, or `undefined` if not available.
 */
export function useMCPServer(): McpServer | undefined;

/** Checks if the current call is an MCP call.
 * This function can be used to determine if the current request is being handled by an MCP server.
 * @returns `true` if the current call is an MCP call, otherwise `false`.
 */
export function isMCPCall(): boolean;
