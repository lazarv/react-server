/**
 * Tests for entry point modules
 * These test the wrapper functions and exported APIs
 */

import { describe, expect, test, vi } from "vitest";

// Client entry point
import {
  createFromFetch,
  createFromReadableStream,
  createServerReference,
  encodeReply,
} from "../client/index.mjs";
// Server entry point
import {
  createClientModuleProxy,
  createTemporaryReferenceSet,
  decodeAction,
  decodeFormState,
  decodeReply,
  postpone,
  prerender,
  registerClientReference,
  registerServerReference,
  renderToReadableStream,
  taintObjectReference,
  taintUniqueValue,
  unstable_postpone,
} from "../server/index.mjs";

// Helper to collect stream
async function streamToString(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

describe("Server Entry Point (index.mjs)", () => {
  describe("renderToReadableStream", () => {
    test("should work", async () => {
      const stream = renderToReadableStream({ hello: "world" });
      const output = await streamToString(stream);
      expect(output).toContain("hello");
    });
  });

  describe("All exported functions exist", () => {
    test("core render functions", () => {
      expect(typeof renderToReadableStream).toBe("function");
      expect(typeof prerender).toBe("function");
    });

    test("decode functions", () => {
      expect(typeof decodeReply).toBe("function");
      expect(typeof decodeAction).toBe("function");
      expect(typeof decodeFormState).toBe("function");
    });

    test("reference functions", () => {
      expect(typeof registerServerReference).toBe("function");
      expect(typeof registerClientReference).toBe("function");
      expect(typeof createClientModuleProxy).toBe("function");
      expect(typeof createTemporaryReferenceSet).toBe("function");
    });

    test("security functions", () => {
      expect(typeof taintUniqueValue).toBe("function");
      expect(typeof taintObjectReference).toBe("function");
    });

    test("postpone functions", () => {
      expect(typeof unstable_postpone).toBe("function");
      expect(typeof postpone).toBe("function");
    });
  });
});

describe("Client Entry Point", () => {
  describe("index.mjs exports", () => {
    test("should export all client functions", () => {
      expect(typeof createFromReadableStream).toBe("function");
      expect(typeof createFromFetch).toBe("function");
      expect(typeof encodeReply).toBe("function");
      expect(typeof createServerReference).toBe("function");
    });
  });

  describe("createServerReference", () => {
    test("should create a callable server reference", async () => {
      const mockCallServer = vi.fn().mockResolvedValue("server result");
      const action = createServerReference("module#action", mockCallServer);

      expect(action.$$typeof).toBe(Symbol.for("react.server.reference"));
      expect(action.$$id).toBe("module#action");
      expect(action.$$bound).toBeNull();

      const result = await action("arg1", "arg2");
      expect(mockCallServer).toHaveBeenCalledWith("module#action", [
        "arg1",
        "arg2",
      ]);
      expect(result).toBe("server result");
    });

    test("should support binding arguments", async () => {
      const mockCallServer = vi.fn().mockResolvedValue("bound result");
      const action = createServerReference(
        "module#boundAction",
        mockCallServer
      );

      const boundAction = action.bind(null, "bound1", "bound2");

      expect(boundAction.$$typeof).toBe(Symbol.for("react.server.reference"));
      expect(boundAction.$$id).toBe("module#boundAction");
      expect(boundAction.$$bound).toEqual(["bound1", "bound2"]);

      await boundAction("extra");
      expect(mockCallServer).toHaveBeenCalledWith("module#boundAction", [
        "bound1",
        "bound2",
        "extra",
      ]);
    });
  });
});
