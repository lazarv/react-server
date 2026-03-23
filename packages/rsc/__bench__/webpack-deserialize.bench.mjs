/**
 * react-server-dom-webpack — deserialization benchmarks
 *
 * Pre-serializes with webpack, then measures createFromReadableStream throughput.
 *
 * NOTE: webpack's serializer transfers/detaches ArrayBuffers, so typed array
 * scenarios create fresh fixtures for each pre-serialization.
 */

import { describe, bench, beforeAll } from "vitest";
import { scenarios } from "./fixtures.mjs";

let ReactDomServer;
let ReactDomClient;
let skip = false;

try {
  ReactDomServer = await import("react-server-dom-webpack/server");
  ReactDomClient = await import("react-server-dom-webpack/client.browser");
} catch {
  skip = true;
}

// Pre-serialized payloads: Map<name, Uint8Array[]>
const serialized = {};

beforeAll(async () => {
  if (skip) return;
  for (const [name, factory] of Object.entries(scenarios)) {
    // Each call to factory() produces a fresh fixture (important for typed arrays)
    const stream = ReactDomServer.renderToReadableStream(factory());
    const reader = stream.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(new Uint8Array(value));
    }
    serialized[name] = chunks;
  }
});

function makeStream(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new Uint8Array(chunk));
      }
      controller.close();
    },
  });
}

const describeIf = skip ? describe.skip : describe;

describeIf("webpack deserialize", () => {
  for (const name of Object.keys(scenarios)) {
    bench(name, async () => {
      const stream = makeStream(serialized[name]);
      await ReactDomClient.createFromReadableStream(stream);
    });
  }
});
