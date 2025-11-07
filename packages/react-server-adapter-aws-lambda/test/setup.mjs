// Test setup - configure environment and mocks
import { vi } from "vitest";

// Mock AWS Lambda runtime
global.awslambda = {
  streamifyResponse: vi.fn((handler) => {
    return async (event, responseStream, context) => {
      return handler(event, responseStream, context);
    };
  }),
};

// Enable debug logging for tests
process.env.DEBUG_AWS_LAMBDA_ADAPTER = "1";

// Mock console methods to capture debug output
global.console = {
  ...console,
  log: vi.fn(console.log),
  error: vi.fn(console.error),
  warn: vi.fn(console.warn),
  debug: vi.fn(console.debug),
};
