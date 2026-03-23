/**
 * @lazarv/rsc — deserialization benchmarks
 *
 * Pre-serializes each fixture, then measures createFromReadableStream throughput.
 */

import { describe, bench, beforeAll } from "vitest";
import * as RscServer from "../server/shared.mjs";
import * as RscClient from "../client/shared.mjs";
import { scenarios } from "./fixtures.mjs";

// Pre-serialized payloads: Map<name, Uint8Array[]>
const serialized = {};

beforeAll(async () => {
  for (const [name, factory] of Object.entries(scenarios)) {
    const stream = RscServer.renderToReadableStream(factory());
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

describe("@lazarv/rsc deserialize", () => {
  for (const name of Object.keys(scenarios)) {
    bench(name, async () => {
      const stream = makeStream(serialized[name]);
      await RscClient.createFromReadableStream(stream);
    });
  }
});
