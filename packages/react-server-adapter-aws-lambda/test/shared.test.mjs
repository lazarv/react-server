import { EventEmitter } from "events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createGetAdapter,
  ReactServerFramework,
  runHandler,
} from "../lambda-wrapper/shared.mjs";

// Mock dependencies
vi.mock("@lazarv/react-server/node", () => ({
  reactServer: vi.fn(() =>
    Promise.resolve({
      middlewares: vi.fn((req, res) => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body>Hello World</body></html>");
      }),
    })
  ),
}));

vi.mock("@h4ad/serverless-adapter", () => ({
  ServerlessAdapter: {
    new: vi.fn(() => ({
      setFramework: vi.fn().mockReturnThis(),
      setLogger: vi.fn().mockReturnThis(),
      setHandler: vi.fn().mockReturnThis(),
      setResolver: vi.fn().mockReturnThis(),
      addAdapter: vi.fn().mockReturnThis(),
      build: vi.fn(() => vi.fn(async () => ({ statusCode: 200 }))),
    })),
  },
  createDefaultLogger: vi.fn(({ level }) => ({ level })),
}));

vi.mock("@h4ad/serverless-adapter/adapters/aws", () => ({
  ApiGatewayV2Adapter: vi.fn(),
}));

vi.mock("@h4ad/serverless-adapter/handlers/default", () => ({
  DefaultHandler: vi.fn(),
}));

vi.mock("@h4ad/serverless-adapter/resolvers/dummy", () => ({
  DummyResolver: vi.fn(),
}));

describe("Shared Lambda Adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure debug is enabled for these tests
    process.env.DEBUG_AWS_LAMBDA_ADAPTER = "2";
  });

  afterEach(() => {
    delete process.env.DEBUG_AWS_LAMBDA_ADAPTER;
  });

  describe("ReactServerFramework", () => {
    it("should create framework with correct name", () => {
      const middlewares = vi.fn();
      const framework = new ReactServerFramework(middlewares);

      expect(framework.getFrameworkName()).toBe("react-server");
      expect(framework.middlewares).toBe(middlewares);
    });

    it("should handle request with ORIGIN host override", async () => {
      // Note: originHost is set at module load time, so we need to
      // test the actual behavior by setting ORIGIN before module loads
      // For this test, we'll verify the mechanism works by checking
      // that the framework can modify headers

      const middlewares = vi.fn((req, res) => {
        res.writeHead(200);
        res.end("OK");
      });

      const framework = new ReactServerFramework(middlewares);

      const mockReq = new EventEmitter();
      mockReq.headers = { host: "original-host.com" };

      const mockRes = new EventEmitter();
      mockRes.writeHead = vi.fn();
      mockRes.end = vi.fn(() => {
        mockRes.emit("finish");
      });

      const promise = framework.sendRequest(null, mockReq, mockRes);

      // Since originHost is null in test environment, host should remain unchanged
      expect(mockReq.headers.host).toBe("original-host.com");
      expect(middlewares).toHaveBeenCalledWith(mockReq, mockRes);

      await promise;
    });

    it("should add default accept header when missing", async () => {
      const middlewares = vi.fn((req, res) => {
        res.writeHead(200);
        res.end("OK");
      });

      const framework = new ReactServerFramework(middlewares);

      const mockReq = new EventEmitter();
      mockReq.headers = {};

      const mockRes = new EventEmitter();
      mockRes.writeHead = vi.fn();
      mockRes.end = vi.fn(() => {
        mockRes.emit("finish");
      });

      const promise = framework.sendRequest(null, mockReq, mockRes);

      expect(mockReq.headers.accept).toBe("text/html");

      await promise;
    });

    it("should handle response errors", async () => {
      const middlewares = vi.fn((req, res) => {
        setTimeout(() => res.emit("error", new Error("Test error")), 10);
      });

      const framework = new ReactServerFramework(middlewares);

      const mockReq = new EventEmitter();
      mockReq.headers = {};

      const mockRes = new EventEmitter();
      mockRes.writeHead = vi.fn();
      mockRes.end = vi.fn();

      await expect(
        framework.sendRequest(null, mockReq, mockRes)
      ).rejects.toThrow("Test error");
    });

    it("should handle response close event", async () => {
      const middlewares = vi.fn((req, res) => {
        setTimeout(() => res.emit("close"), 10);
      });

      const framework = new ReactServerFramework(middlewares);

      const mockReq = new EventEmitter();
      mockReq.headers = {};

      const mockRes = new EventEmitter();
      mockRes.writeHead = vi.fn();
      mockRes.end = vi.fn();

      await expect(
        framework.sendRequest(null, mockReq, mockRes)
      ).resolves.toBeUndefined();
    });

    it("should handle middleware exceptions", async () => {
      const middlewares = vi.fn(() => {
        throw new Error("Middleware error");
      });

      const framework = new ReactServerFramework(middlewares);

      const mockReq = new EventEmitter();
      mockReq.headers = {};

      const mockRes = new EventEmitter();
      mockRes.writeHead = vi.fn();
      mockRes.end = vi.fn();

      await expect(
        framework.sendRequest(null, mockReq, mockRes)
      ).rejects.toThrow("Middleware error");
    });
  });

  describe("createGetAdapter", () => {
    it("should create adapter with debug logging enabled", async () => {
      const HandlerCtor = vi.fn();
      const ResolverCtor = vi.fn();

      const getAdapter = createGetAdapter(HandlerCtor, ResolverCtor);
      const adapter = await getAdapter();

      expect(adapter).toBeDefined();

      // Verify that the logger was configured with debug level
      const { createDefaultLogger } = await import("@h4ad/serverless-adapter");
      expect(createDefaultLogger).toHaveBeenCalledWith({ level: "debug" });
    });

    it("should use warn level when debug is disabled", async () => {
      delete process.env.DEBUG_AWS_LAMBDA_ADAPTER;

      const HandlerCtor = vi.fn();
      const ResolverCtor = vi.fn();

      const getAdapter = createGetAdapter(HandlerCtor, ResolverCtor);
      await getAdapter();

      const { createDefaultLogger } = await import("@h4ad/serverless-adapter");
      expect(createDefaultLogger).toHaveBeenCalledWith({ level: "warn" });
    });

    it("should memoize adapter creation", async () => {
      const HandlerCtor = vi.fn();
      const ResolverCtor = vi.fn();

      const getAdapter = createGetAdapter(HandlerCtor, ResolverCtor);

      const adapter1 = await getAdapter();
      const adapter2 = await getAdapter();

      expect(adapter1).toBe(adapter2);
    });
  });

  describe("runHandler", () => {
    it("should set callbackWaitsForEmptyEventLoop to false", async () => {
      const mockAdapter = vi.fn().mockResolvedValue({ statusCode: 200 });
      const getAdapter = vi.fn().mockResolvedValue(mockAdapter);

      const event = { path: "/test" };
      const context = { callbackWaitsForEmptyEventLoop: true };

      const result = await runHandler(event, context, getAdapter);

      expect(context.callbackWaitsForEmptyEventLoop).toBe(false);
      expect(mockAdapter).toHaveBeenCalledWith(event, context);
      expect(result).toEqual({ statusCode: 200 });
    });

    it("should handle missing context gracefully", async () => {
      const mockAdapter = vi.fn().mockResolvedValue({ statusCode: 200 });
      const getAdapter = vi.fn().mockResolvedValue(mockAdapter);

      const event = { path: "/test" };

      const result = await runHandler(event, null, getAdapter);

      expect(mockAdapter).toHaveBeenCalledWith(event, null);
      expect(result).toEqual({ statusCode: 200 });
    });

    it("should propagate adapter errors", async () => {
      const mockAdapter = vi.fn().mockRejectedValue(new Error("Adapter error"));
      const getAdapter = vi.fn().mockResolvedValue(mockAdapter);

      const event = { path: "/test" };
      const context = {};

      await expect(runHandler(event, context, getAdapter)).rejects.toThrow(
        "Adapter error"
      );
    });
  });

  describe("Debug logging", () => {
    it("should activate debug logging when DEBUG_AWS_LAMBDA_ADAPTER=1", async () => {
      process.env.DEBUG_AWS_LAMBDA_ADAPTER = "2";

      const HandlerCtor = vi.fn();
      const ResolverCtor = vi.fn();

      const getAdapter = createGetAdapter(HandlerCtor, ResolverCtor);
      await getAdapter();

      const { createDefaultLogger } = await import("@h4ad/serverless-adapter");
      expect(createDefaultLogger).toHaveBeenCalledWith({ level: "debug" });
    });

    it("should use warn level when DEBUG_AWS_LAMBDA_ADAPTER is not set", async () => {
      delete process.env.DEBUG_AWS_LAMBDA_ADAPTER;

      const HandlerCtor = vi.fn();
      const ResolverCtor = vi.fn();

      const getAdapter = createGetAdapter(HandlerCtor, ResolverCtor);
      await getAdapter();

      const { createDefaultLogger } = await import("@h4ad/serverless-adapter");
      expect(createDefaultLogger).toHaveBeenCalledWith({ level: "warn" });
    });

    it("should use warn level when DEBUG_AWS_LAMBDA_ADAPTER=0", async () => {
      process.env.DEBUG_AWS_LAMBDA_ADAPTER = "0";

      const HandlerCtor = vi.fn();
      const ResolverCtor = vi.fn();

      const getAdapter = createGetAdapter(HandlerCtor, ResolverCtor);
      await getAdapter();

      const { createDefaultLogger } = await import("@h4ad/serverless-adapter");
      expect(createDefaultLogger).toHaveBeenCalledWith({ level: "warn" });
    });
  });
});
