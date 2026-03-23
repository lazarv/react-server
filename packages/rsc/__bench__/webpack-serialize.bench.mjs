/**
 * react-server-dom-webpack — serialization benchmarks
 *
 * Measures renderToReadableStream throughput for the same fixtures as the
 * @lazarv/rsc benchmarks, enabling direct comparison.
 *
 * NOTE: webpack's serializer transfers/detaches ArrayBuffers, so typed array
 * scenarios must create fresh fixtures each iteration.
 */

import { describe, bench, beforeAll } from "vitest";
import { scenarios } from "./fixtures.mjs";

let ReactDomServer;
let skip = false;

try {
  ReactDomServer = await import("react-server-dom-webpack/server");
} catch {
  skip = true;
}

// Scenarios that contain TypedArrays — these need fresh fixtures per iteration
// because webpack's serializer detaches the underlying ArrayBuffer.
const TYPED_ARRAY_SCENARIOS = new Set([
  "data: typed arrays",
  "data: mixed payload",
]);

// Pre-build fixtures once (for non-typed-array scenarios).
const fixtures = {};

beforeAll(() => {
  for (const [name, factory] of Object.entries(scenarios)) {
    if (!TYPED_ARRAY_SCENARIOS.has(name)) {
      fixtures[name] = factory();
    }
  }
});

async function consumeStream(stream) {
  const reader = stream.getReader();
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
  }
  return bytes;
}

const describeIf = skip ? describe.skip : describe;

describeIf("webpack serialize", () => {
  for (const [name, factory] of Object.entries(scenarios)) {
    if (TYPED_ARRAY_SCENARIOS.has(name)) {
      // Fresh fixture each iteration to avoid detached ArrayBuffer errors
      bench(name, async () => {
        const stream = ReactDomServer.renderToReadableStream(factory());
        await consumeStream(stream);
      });
    } else {
      bench(name, async () => {
        const stream = ReactDomServer.renderToReadableStream(fixtures[name]);
        await consumeStream(stream);
      });
    }
  }
});
