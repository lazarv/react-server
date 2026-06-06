/**
 * @lazarv/rsc — roundtrip benchmarks
 *
 * Measures full serialize → deserialize cycle for each fixture.
 */

import { describe, test, beforeAll } from "vitest";
import * as RscServer from "../server/shared.mjs";
import * as RscClient from "../client/shared.mjs";
import { scenarios } from "./fixtures.mjs";

const fixtures = {};

beforeAll(() => {
  for (const [name, factory] of Object.entries(scenarios)) {
    fixtures[name] = factory();
  }
});

describe("@lazarv/rsc roundtrip", () => {
  test("benchmarks", async ({ bench }) => {
    for (const name of Object.keys(scenarios)) {
      await bench(name, async () => {
        const stream = RscServer.renderToReadableStream(fixtures[name]);
        await RscClient.createFromReadableStream(stream);
      }).run();
    }
  });
});
