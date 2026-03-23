/**
 * @lazarv/rsc — serialization benchmarks
 *
 * Measures renderToReadableStream throughput for various React trees and data types.
 */

import { describe, bench, beforeAll } from "vitest";
import * as RscServer from "../server/shared.mjs";
import { scenarios } from "./fixtures.mjs";

// Pre-build fixtures once so we benchmark serialization, not construction.
const fixtures = {};

beforeAll(() => {
  for (const [name, factory] of Object.entries(scenarios)) {
    fixtures[name] = factory();
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

describe("@lazarv/rsc serialize", () => {
  for (const name of Object.keys(scenarios)) {
    bench(name, async () => {
      const stream = RscServer.renderToReadableStream(fixtures[name]);
      await consumeStream(stream);
    });
  }
});

describe("@lazarv/rsc prerender", () => {
  for (const name of Object.keys(scenarios)) {
    bench(name, async () => {
      const { prelude } = await RscServer.prerender(fixtures[name]);
      await consumeStream(prelude);
    });
  }
});
