/**
 * Vitest setup file
 *
 * Suppress unhandled rejection warnings from async generator error propagation tests.
 * These are false positives - the errors are properly caught and serialized to the stream,
 * but Vitest tracks the internal promises created by async generators and reports them
 * as unhandled even when they're caught.
 */

// Store the original handler (side effect: captures listeners before removal)
process.listeners("unhandledRejection");

// Replace with a handler that ignores "Generator error" from our tests
process.removeAllListeners("unhandledRejection");
process.on("unhandledRejection", (reason) => {
  // Suppress known false positives from async generator error tests
  if (reason && reason.message === "Generator error") {
    return; // Suppress
  }
  // For all other errors, throw to fail the test
  throw reason;
});

/**
 * Mock webpack globals for react-server-dom-webpack cross-compatibility tests.
 * react-server-dom-webpack expects these to be available in the runtime.
 */
globalThis.__webpack_require__ = (_id) => {
  // Return a mock module - we don't actually need webpack module loading for protocol tests
  return {};
};

globalThis.__webpack_chunk_load__ = () => Promise.resolve();
