/**
 * react-server-dom-webpack — roundtrip benchmarks
 *
 * Measures full serialize + deserialize cycle for each fixture.
 *
 * NOTE: webpack's serializer transfers/detaches ArrayBuffers, so typed array
 * scenarios must create fresh fixtures each iteration.
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

const TYPED_ARRAY_SCENARIOS = new Set([
  "data: typed arrays",
  "data: mixed payload",
]);

const fixtures = {};

beforeAll(() => {
  for (const [name, factory] of Object.entries(scenarios)) {
    if (!TYPED_ARRAY_SCENARIOS.has(name)) {
      fixtures[name] = factory();
    }
  }
});

const describeIf = skip ? describe.skip : describe;

describeIf("webpack roundtrip", () => {
  for (const [name, factory] of Object.entries(scenarios)) {
    if (TYPED_ARRAY_SCENARIOS.has(name)) {
      bench(name, async () => {
        const stream = ReactDomServer.renderToReadableStream(factory());
        await ReactDomClient.createFromReadableStream(stream);
      });
    } else {
      bench(name, async () => {
        const stream = ReactDomServer.renderToReadableStream(fixtures[name]);
        await ReactDomClient.createFromReadableStream(stream);
      });
    }
  }
});
