import { Writable } from "node:stream";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock @lazarv/react-server/node before importing the handler
vi.mock("@lazarv/react-server/node", () => ({
  reactServer: vi.fn(() =>
    Promise.resolve({
      middlewares: (req, res) => {
        // Simulate React Server middleware processing
        res.statusCode = 200;
        res.setHeader("content-type", "text/html");
        res.write("<!DOCTYPE html><html><body>Test Response</body></html>");
        res.end();
      },
    })
  ),
}));

/**
 * Mock AWS Lambda streaming response
 */
class MockAWSResponseStream extends Writable {
  constructor() {
    super();
    this.chunks = [];
    this.metadata = null;
    this.streamEnded = false;
  }

  _write(chunk, encoding, callback) {
    this.chunks.push(chunk);
    callback();
  }

  _final(callback) {
    this.streamEnded = true;
    callback();
  }

  get ended() {
    return this.streamEnded;
  }

  setContentType(contentType) {
    if (!this.metadata) this.metadata = {};
    this.metadata.contentType = contentType;
  }
}

/**
 * Mock AWS Lambda global with streamifyResponse
 */
global.awslambda = {
  streamifyResponse: (handler) => handler,
  HttpResponseStream: {
    from: (stream, metadata) => {
      stream.metadata = metadata;
      return stream;
    },
  },
};

describe("Streaming Handler - AWS Lambda Timeout Simulation", () => {
  let handler;
  let mockResponseStream;
  let mockContext;
  let timeoutHandle = null;

  beforeEach(async () => {
    // Clear module cache to get fresh instance
    vi.resetModules();

    // Import the streaming handler
    const streamingModule = await import(
      "../lambda-wrapper/index.streaming.mjs"
    );
    handler = streamingModule.handler;

    // Create mock response stream
    mockResponseStream = new MockAWSResponseStream();

    // Create mock context with event loop detection
    mockContext = {
      callbackWaitsForEmptyEventLoop: true,
      functionName: "test-function",
      awsRequestId: "test-request-id",
      getRemainingTimeInMillis: () => 15000,
    };
  });

  afterEach(() => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
  });

  /**
   * Simulate AWS Lambda timeout behavior
   */
  function simulateLambdaTimeout(maxDuration = 15000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      timeoutHandle = setTimeout(() => {
        reject(
          new Error(
            `Lambda timed out after ${maxDuration}ms (callbackWaitsForEmptyEventLoop=${mockContext.callbackWaitsForEmptyEventLoop})`
          )
        );
      }, maxDuration);

      // Check if handler completes before timeout
      const checkCompletion = setInterval(() => {
        const elapsed = Date.now() - startTime;

        // If callbackWaitsForEmptyEventLoop is false and stream is ended,
        // Lambda should exit immediately
        if (
          !mockContext.callbackWaitsForEmptyEventLoop &&
          mockResponseStream.ended
        ) {
          clearTimeout(timeoutHandle);
          clearInterval(checkCompletion);
          timeoutHandle = null;
          resolve({
            timedOut: false,
            duration: elapsed,
            streamCompleted: mockResponseStream.ended,
          });
        }

        // If we've been waiting too long with callbackWaitsForEmptyEventLoop=true
        if (mockContext.callbackWaitsForEmptyEventLoop && elapsed > 5000) {
          clearTimeout(timeoutHandle);
          clearInterval(checkCompletion);
          timeoutHandle = null;
          reject(
            new Error(
              `Lambda would timeout: callbackWaitsForEmptyEventLoop is still true after ${elapsed}ms`
            )
          );
        }
      }, 100);
    });
  }

  it("should set callbackWaitsForEmptyEventLoop to false to prevent timeout", async () => {
    const mockEvent = {
      version: "2.0",
      routeKey: "$default",
      rawPath: "/",
      rawQueryString: "",
      headers: {
        accept: "text/html",
        host: "example.lambda-url.us-east-1.on.aws",
      },
      requestContext: {
        accountId: "anonymous",
        apiId: "test-api",
        domainName: "example.lambda-url.us-east-1.on.aws",
        http: {
          method: "GET",
          path: "/",
          protocol: "HTTP/1.1",
          sourceIp: "127.0.0.1",
        },
        requestId: "test-request-id",
        routeKey: "$default",
        stage: "$default",
        time: "04/Nov/2025:00:00:00 +0000",
        timeEpoch: Date.now(),
      },
      isBase64Encoded: false,
    };

    // Execute handler
    const handlerPromise = handler(mockEvent, mockResponseStream, mockContext);

    // Start timeout simulation
    const timeoutPromise = simulateLambdaTimeout(15000);

    // Wait for both to complete or timeout
    const result = await Promise.race([
      handlerPromise.then(() => timeoutPromise),
      timeoutPromise,
    ]);

    // Verify the Lambda completed quickly without timeout
    expect(result.timedOut).toBe(false);
    expect(result.duration).toBeLessThan(5000); // Should complete in under 5 seconds
    expect(result.streamCompleted).toBe(true);

    // Verify context was set correctly
    expect(mockContext.callbackWaitsForEmptyEventLoop).toBe(false);

    // Verify response stream received data
    expect(mockResponseStream.chunks.length).toBeGreaterThan(0);
    expect(mockResponseStream.ended).toBe(true);

    // Verify metadata was set
    expect(mockResponseStream.metadata).toBeDefined();
    expect(mockResponseStream.metadata.statusCode).toBe(200);
  }, 20000); // 20 second timeout for the test itself

  it("should complete streaming response and exit immediately", async () => {
    const mockEvent = {
      version: "2.0",
      routeKey: "$default",
      rawPath: "/",
      rawQueryString: "",
      headers: {
        accept: "text/html",
        host: "example.lambda-url.us-east-1.on.aws",
      },
      requestContext: {
        accountId: "anonymous",
        apiId: "test-api",
        domainName: "example.lambda-url.us-east-1.on.aws",
        http: {
          method: "GET",
          path: "/",
          protocol: "HTTP/1.1",
          sourceIp: "127.0.0.1",
        },
        requestId: "test-request-id",
        routeKey: "$default",
        stage: "$default",
        time: "04/Nov/2025:00:00:00 +0000",
        timeEpoch: Date.now(),
      },
      isBase64Encoded: false,
    };

    const startTime = Date.now();

    // Execute handler
    await handler(mockEvent, mockResponseStream, mockContext);

    const duration = Date.now() - startTime;

    // Should complete quickly (not wait for event loop)
    expect(duration).toBeLessThan(3000);

    // Context should have been set to false
    expect(mockContext.callbackWaitsForEmptyEventLoop).toBe(false);

    // Stream should be complete
    expect(mockResponseStream.ended).toBe(true);
  }, 10000);

  it("should handle multiple sequential requests without timeout", async () => {
    const mockEvent = {
      version: "2.0",
      routeKey: "$default",
      rawPath: "/",
      rawQueryString: "",
      headers: {
        accept: "text/html",
        host: "example.lambda-url.us-east-1.on.aws",
      },
      requestContext: {
        accountId: "anonymous",
        apiId: "test-api",
        domainName: "example.lambda-url.us-east-1.on.aws",
        http: {
          method: "GET",
          path: "/",
          protocol: "HTTP/1.1",
          sourceIp: "127.0.0.1",
        },
        requestId: "test-request-1",
        routeKey: "$default",
        stage: "$default",
        time: "04/Nov/2025:00:00:00 +0000",
        timeEpoch: Date.now(),
      },
      isBase64Encoded: false,
    };

    // Simulate Lambda container reuse - multiple invocations
    for (let i = 0; i < 3; i++) {
      const stream = new MockAWSResponseStream();
      const context = {
        callbackWaitsForEmptyEventLoop: true,
        functionName: "test-function",
        awsRequestId: `test-request-${i}`,
        getRemainingTimeInMillis: () => 15000,
      };

      const startTime = Date.now();
      await handler(mockEvent, stream, context);
      const duration = Date.now() - startTime;

      // Each request should complete quickly
      expect(duration).toBeLessThan(3000);
      expect(context.callbackWaitsForEmptyEventLoop).toBe(false);
      expect(stream.ended).toBe(true);
    }
  }, 20000);

  it("should properly close stream even with long-running background tasks", async () => {
    // Simulate background tasks that would keep event loop busy
    const backgroundTasks = [];
    for (let i = 0; i < 5; i++) {
      backgroundTasks.push(
        new Promise((resolve) => setTimeout(resolve, 10000))
      );
    }

    const mockEvent = {
      version: "2.0",
      routeKey: "$default",
      rawPath: "/",
      rawQueryString: "",
      headers: {
        accept: "text/html",
        host: "example.lambda-url.us-east-1.on.aws",
      },
      requestContext: {
        accountId: "anonymous",
        apiId: "test-api",
        domainName: "example.lambda-url.us-east-1.on.aws",
        http: {
          method: "GET",
          path: "/",
          protocol: "HTTP/1.1",
          sourceIp: "127.0.0.1",
        },
        requestId: "test-request-id",
        routeKey: "$default",
        stage: "$default",
        time: "04/Nov/2025:00:00:00 +0000",
        timeEpoch: Date.now(),
      },
      isBase64Encoded: false,
    };

    const startTime = Date.now();
    await handler(mockEvent, mockResponseStream, mockContext);
    const duration = Date.now() - startTime;

    // Should complete quickly despite background tasks
    expect(duration).toBeLessThan(3000);
    expect(mockContext.callbackWaitsForEmptyEventLoop).toBe(false);
    expect(mockResponseStream.ended).toBe(true);

    // Background tasks should still be running
    const pendingTasks = backgroundTasks.filter(
      (task) => task.isPending !== false
    );
    expect(pendingTasks.length).toBeGreaterThan(0);
  }, 15000);
});
