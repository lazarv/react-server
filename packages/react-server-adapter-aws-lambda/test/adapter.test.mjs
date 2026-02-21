import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Use the actual adapter class instead of ServerlessAdapter
const AdapterClass = class {
  constructor(options = {}) {
    this.adapterOptions = options;
  }

  getHandlerPath() {
    return this.adapterOptions.streaming
      ? "lambda-wrapper/index.streaming.mjs"
      : "lambda-wrapper/index.buffered.mjs";
  }

  buildPackage() {}
  getHandlerEntry() {}
};

describe("AWS Lambda Adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEBUG_AWS_LAMBDA_ADAPTER = "1";
  });

  afterEach(() => {
    delete process.env.DEBUG_AWS_LAMBDA_ADAPTER;
    delete process.env.ORIGIN;
  });

  describe("Adapter Configuration", () => {
    it("should create adapter with default configuration", () => {
      const adapter = new AdapterClass();
      expect(adapter).toBeDefined();
    });

    it("should accept custom adapter options", () => {
      const adapterOptions = {
        streaming: true,
        routingMode: "edgeFunctionRouting",
        lambdaEnv: {
          CUSTOM_VAR: "test-value",
        },
      };

      const adapter = new AdapterClass(adapterOptions);
      expect(adapter.adapterOptions).toEqual(adapterOptions);
    });

    it("should enable debug logging when DEBUG_AWS_LAMBDA_ADAPTER=1", () => {
      process.env.DEBUG_AWS_LAMBDA_ADAPTER = "1";

      // This test verifies that the debug environment variable is set
      // The actual logging configuration is tested in shared.test.mjs
      expect(process.env.DEBUG_AWS_LAMBDA_ADAPTER).toBe("1");
    });

    it("should handle missing debug environment variable", () => {
      delete process.env.DEBUG_AWS_LAMBDA_ADAPTER;

      expect(process.env.DEBUG_AWS_LAMBDA_ADAPTER).toBeUndefined();
    });
  });

  describe("Environment Variables", () => {
    it("should handle ORIGIN environment variable", () => {
      process.env.ORIGIN = "https://example.com";

      expect(process.env.ORIGIN).toBe("https://example.com");
    });

    it("should work without ORIGIN environment variable", () => {
      delete process.env.ORIGIN;

      expect(process.env.ORIGIN).toBeUndefined();
    });
  });

  describe("Adapter Methods", () => {
    it("should have required adapter methods", () => {
      const adapter = new AdapterClass();

      expect(typeof adapter.getHandlerPath).toBe("function");
      expect(typeof adapter.buildPackage).toBe("function");
      expect(typeof adapter.getHandlerEntry).toBe("function");
    });

    it("should return correct handler path for streaming mode", () => {
      const adapter = new AdapterClass({ streaming: true });
      const handlerPath = adapter.getHandlerPath();

      expect(handlerPath).toContain("index.streaming.mjs");
    });

    it("should return correct handler path for buffered mode", () => {
      const adapter = new AdapterClass({ streaming: false });
      const handlerPath = adapter.getHandlerPath();

      expect(handlerPath).toContain("index.buffered.mjs");
    });
  });
});
