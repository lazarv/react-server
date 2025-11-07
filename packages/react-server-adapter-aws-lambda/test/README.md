# Testing AWS Lambda Adapter

This directory contains comprehensive tests for the AWS Lambda adapter using vitest.

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

## Debug Logging

Enable detailed debug logging during tests and development:

```bash
# For local testing with lambda-handler-tester
DEBUG_AWS_LAMBDA_ADAPTER=1 pnpm dlx lambda-handler-tester --watch 8009

# For curl testing
DEBUG_AWS_LAMBDA_ADAPTER=1 curl -v http://localhost:8009

# For deployed Lambda function
aws lambda update-function-configuration \
  --function-name <FUNCTION_NAME> \
  --environment "Variables={DEBUG_AWS_LAMBDA_ADAPTER=1}"
```

## Test Structure

- `setup.mjs` - Test environment setup and global mocks
- `shared.test.mjs` - Tests for shared adapter logic and framework bridge
- `adapter.test.mjs` - Tests for main adapter configuration and methods
- `utils.test.mjs` - Tests for infrastructure utilities
- `streaming.test.mjs` - Tests for streaming handler functionality
- `streaming-timeout.integration.test.mjs` - Integration tests for Lambda timeout prevention

### streaming-timeout.integration.test.mjs

This integration test validates that the AWS Lambda streaming handler properly sets `callbackWaitsForEmptyEventLoop` to `false` to prevent timeouts.

**Background**: AWS Lambda waits for the Node.js event loop to be empty before terminating. For streaming responses, the response may complete quickly (~1s) but Lambda will wait for the full timeout period (15s) by default.

**The Fix**: Setting `context.callbackWaitsForEmptyEventLoop = false` tells Lambda to exit immediately after the response completes.

**Test Scenarios**:
1. Verifies `callbackWaitsForEmptyEventLoop` is set to `false`
2. Confirms stream completes and Lambda exits quickly (< 5 seconds)
3. Tests multiple sequential requests (Lambda container reuse)
4. Validates behavior with long-running background tasks

**Production Results**:
- Before fix: 15000ms (timeout)
- After fix: 650ms (cold), 126ms (warm) - **~120x improvement!** 🚀

## Debug Output

When `DEBUG_AWS_LAMBDA_ADAPTER=1` is set, you'll see detailed logging:

```
[aws-lambda-adapter] Initializing AWS Lambda adapter { DEBUG_AWS_LAMBDA_ADAPTER: '1', ORIGIN: 'https://example.com', NODE_ENV: 'production' }
[aws-lambda-adapter] Booting React Server with origin: https://example.com
[aws-lambda-adapter] Creating adapter factory with: { Handler: 'AwsStreamHandler', Resolver: 'DummyResolver' }
[aws-lambda-adapter] [abc123] Handler invoked: { httpMethod: 'GET', path: '/', isBase64Encoded: false, hasBody: false }
[aws-lambda-adapter] [abc123] Processing request: { method: 'GET', url: '/', headers: ['host', 'accept'] }
[aws-lambda-adapter] [abc123] Calling React Server middlewares
[aws-lambda-adapter] [abc123] Response finished
[aws-lambda-adapter] [abc123] Request completed
[aws-lambda-adapter] [abc123] Handler completed: { statusCode: 200, hasBody: true }
```

## Coverage

Test coverage focuses on:

- ✅ Framework bridge (`ReactServerFramework`)
- ✅ Adapter factory (`createGetAdapter`)
- ✅ Handler runner (`runHandler`)
- ✅ Debug logging activation
- ✅ Environment variable handling
- ✅ Error handling and cleanup
- ✅ Infrastructure utilities
- ✅ Streaming vs buffered modes

## Debugging Hanging Requests

If you encounter hanging requests during testing:

1. **Enable debug logging**: `DEBUG_AWS_LAMBDA_ADAPTER=1`
2. **Check event loop**: Look for unclosed promises or timers
3. **Verify response handling**: Ensure response events (finish/close/error) are properly handled
4. **Test timeouts**: Use tools like `timeout` or add test timeouts

Example debugging session:

```bash
# Start lambda-handler-tester with debug
DEBUG_AWS_LAMBDA_ADAPTER=1 pnpm dlx lambda-handler-tester --watch 8009 .aws-lambda/output/functions/index.func/index.mjs

# In another terminal, test with curl
curl -v -H "Accept: text/html" http://localhost:8009/

# Check the debug output for request lifecycle
```

This comprehensive test suite ensures the AWS Lambda adapter works correctly in both streaming and buffered modes with proper error handling and debugging capabilities.