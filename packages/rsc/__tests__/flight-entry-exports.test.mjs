/**
 * Tests specifically importing from entry point modules to improve coverage
 * These tests ensure the re-exports work correctly
 */

import { describe, expect, test, vi } from "vitest";

// Import from client/index.mjs entry point
import * as ClientIndex from "../client/index.mjs";
// Import from server/index.mjs entry point
import * as ServerIndex from "../server/index.mjs";

describe("Client Entry Point (client/index.mjs)", () => {
  test("should export createFromReadableStream", () => {
    expect(ClientIndex.createFromReadableStream).toBeDefined();
    expect(typeof ClientIndex.createFromReadableStream).toBe("function");
  });

  test("should export createFromFetch", () => {
    expect(ClientIndex.createFromFetch).toBeDefined();
    expect(typeof ClientIndex.createFromFetch).toBe("function");
  });

  test("should export encodeReply", () => {
    expect(ClientIndex.encodeReply).toBeDefined();
    expect(typeof ClientIndex.encodeReply).toBe("function");
  });

  test("should export createServerReference", () => {
    expect(ClientIndex.createServerReference).toBeDefined();
    expect(typeof ClientIndex.createServerReference).toBe("function");
  });

  test("createFromReadableStream should work", async () => {
    const data = { test: "index client" };
    const stream = ServerIndex.renderToReadableStream(data);
    const result = await ClientIndex.createFromReadableStream(stream);
    expect(result).toEqual(data);
  });

  test("encodeReply should work", async () => {
    const data = { count: 42 };
    const encoded = await ClientIndex.encodeReply(data);
    expect(encoded).toBeDefined();
  });

  test("createServerReference should create callable function", async () => {
    const callServer = vi.fn().mockResolvedValue("ok");
    const action = ClientIndex.createServerReference(
      "module#indexAction",
      callServer
    );

    expect(typeof action).toBe("function");
    await action();
    expect(callServer).toHaveBeenCalledWith("module#indexAction", []);
  });
});

describe("Server Entry Point (server/index.mjs)", () => {
  test("should export all render functions", () => {
    expect(ServerIndex.renderToReadableStream).toBeDefined();
    expect(ServerIndex.prerender).toBeDefined();
  });

  test("should export decode functions", () => {
    expect(ServerIndex.decodeReply).toBeDefined();
    expect(ServerIndex.decodeAction).toBeDefined();
    expect(ServerIndex.decodeFormState).toBeDefined();
  });

  test("should export reference functions", () => {
    expect(ServerIndex.registerServerReference).toBeDefined();
    expect(ServerIndex.registerClientReference).toBeDefined();
    expect(ServerIndex.createClientModuleProxy).toBeDefined();
    expect(ServerIndex.createTemporaryReferenceSet).toBeDefined();
  });

  test("should export security functions", () => {
    expect(ServerIndex.taintUniqueValue).toBeDefined();
    expect(ServerIndex.taintObjectReference).toBeDefined();
  });

  test("should export postpone functions", () => {
    expect(ServerIndex.postpone).toBeDefined();
    expect(ServerIndex.unstable_postpone).toBeDefined();
  });
});

describe("Cross-entry point compatibility", () => {
  test("server output can be read by client", async () => {
    const data = { cross: "compatible", num: 123 };
    const stream = ServerIndex.renderToReadableStream(data);
    const result = await ClientIndex.createFromReadableStream(stream);
    expect(result).toEqual(data);
  });
});

describe("createFromFetch", () => {
  test("client createFromFetch should work with mock fetch response", async () => {
    const data = { fetched: "from index" };
    const stream = ServerIndex.renderToReadableStream(data);

    const mockResponse = new Response(stream);
    const fetchPromise = Promise.resolve(mockResponse);

    const result = await ClientIndex.createFromFetch(fetchPromise);
    expect(result).toEqual(data);
  });
});
