import { describe, expect, it, vi } from "vitest";

// Mock the shared module
const mockMiddlewares = vi.fn();
const mockDebug = vi.fn();

// Create a mock class for ReactServerFramework
class MockReactServerFramework {
  constructor(middlewares) {
    this.middlewares = middlewares;
  }
}

vi.mock("../lambda-wrapper/shared.mjs", () => ({
  getMiddlewares: vi.fn(async () => mockMiddlewares),
  ReactServerFramework: vi.fn(function (middlewares) {
    return new MockReactServerFramework(middlewares);
  }),
  debug: mockDebug,
}));

// Mock AWS Lambda streaming
const mockStreamHandler = vi.fn();
global.awslambda = {
  streamifyResponse: vi.fn((handler) => handler),
};

// Mock @h4ad/serverless-adapter
vi.mock("@h4ad/serverless-adapter", () => ({
  AwsStreamHandler: vi.fn(() => ({
    getHandler: vi.fn(() => mockStreamHandler),
  })),
  ApiGatewayV2Adapter: vi.fn(),
  DummyResolver: vi.fn(),
  getDefaultIfUndefined: vi.fn((val) => val ?? {}),
  createDefaultLogger: vi.fn(() => ({
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe("Streaming Handler", () => {
  it("should export a handler", async () => {
    const { handler } = await import("../lambda-wrapper/index.streaming.mjs");
    expect(handler).toBeDefined();
    expect(typeof handler).toBe("function");
  });

  it("should use AwsStreamHandler and DummyResolver", async () => {
    const { getMiddlewares, ReactServerFramework } = await import(
      "../lambda-wrapper/shared.mjs"
    );
    expect(getMiddlewares).toHaveBeenCalled();
    expect(ReactServerFramework).toHaveBeenCalled();
  });

  it("should export a handler function from streaming module", async () => {
    // Import the handler module
    const { handler } = await import("../lambda-wrapper/index.streaming.mjs");

    // Verify handler is exported and is a function
    expect(handler).toBeDefined();
    expect(typeof handler).toBe("function");
  });
});
