/**
 * Cross-compatibility tests for prerender between @lazarv/rsc and react-server-dom-webpack
 *
 * This file is separate from flight-cross-compat.test.mjs because React has a limitation
 * where only one RSC renderer can be active at a time. By using Vitest's poolOptions
 * with isolate: true, each test file runs in its own process, avoiding conflicts.
 *
 * This file tests React's prerender -> lazarv client, while the main cross-compat file
 * tests lazarv prerender -> React client.
 *
 * NOTE: These tests require the NODE_OPTIONS='--conditions=react-server' flag to run.
 * Run with: NODE_OPTIONS='--conditions=react-server' pnpm test __tests__/flight-cross-compat-prerender.test.mjs
 */

import React from "react";

import { beforeAll, describe, expect, test } from "vitest";

// @lazarv/rsc imports
import * as LazarvClient from "../client/shared.mjs";

// Try to import react-server-dom-webpack static - it may fail without --conditions=react-server
let ReactStaticEdge;
let skipTests = false;

try {
  ReactStaticEdge = await import("react-server-dom-webpack/static.edge");
} catch {
  // Skip tests if react-server condition is not enabled
  skipTests = true;
  console.warn(
    "Skipping React prerender cross-compatibility tests: react-server condition not enabled"
  );
  console.warn(
    "Run with: NODE_OPTIONS='--conditions=react-server' pnpm test __tests__/flight-cross-compat-prerender.test.mjs"
  );
}

// Helper to collect stream output
async function streamToString(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

// Helper to clone a ReadableStream for inspection
function teeStream(stream) {
  const [stream1, stream2] = stream.tee();
  return { forConsumption: stream1, forInspection: stream2 };
}

describe("React Prerender to lazarv Client Cross-Compatibility", () => {
  beforeAll(() => {
    if (skipTests) return;
  });

  test.skipIf(skipTests)(
    "lazarv client should decode React prerender output",
    async () => {
      const element = React.createElement(
        "div",
        { className: "react-prerendered" },
        "React static"
      );

      // Prerender with React
      const { prelude } = await ReactStaticEdge.prerender(element);
      const rawData = await streamToString(prelude);

      // Parse with lazarv client
      const { forConsumption } = teeStream(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(rawData));
            controller.close();
          },
        })
      );

      const result =
        await LazarvClient.createFromReadableStream(forConsumption);

      expect(result.type).toBe("div");
      expect(result.props.className).toBe("react-prerendered");
      expect(result.props.children).toBe("React static");
    }
  );

  test.skipIf(skipTests)(
    "React prerender with nested elements should be decodable by lazarv",
    async () => {
      const element = React.createElement(
        "section",
        null,
        React.createElement("h2", null, "Header"),
        React.createElement("span", null, "Content")
      );

      // Prerender with React, decode with lazarv
      const { prelude: reactPrelude } =
        await ReactStaticEdge.prerender(element);
      const reactData = await streamToString(reactPrelude);

      const { forConsumption: forLazarv } = teeStream(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(reactData));
            controller.close();
          },
        })
      );

      const lazarvResult =
        await LazarvClient.createFromReadableStream(forLazarv);

      expect(lazarvResult.type).toBe("section");
      expect(lazarvResult.props.children).toHaveLength(2);
      expect(lazarvResult.props.children[0].type).toBe("h2");
      expect(lazarvResult.props.children[1].type).toBe("span");
    }
  );

  test.skipIf(skipTests)(
    "React prerender with complex props should be decodable by lazarv",
    async () => {
      const element = React.createElement(
        "div",
        {
          className: "complex",
          "data-id": 123,
          style: { color: "red", fontSize: "14px" },
        },
        React.createElement("span", { key: "1" }, "First"),
        React.createElement("span", { key: "2" }, "Second")
      );

      const { prelude } = await ReactStaticEdge.prerender(element);
      const rawData = await streamToString(prelude);

      const { forConsumption } = teeStream(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(rawData));
            controller.close();
          },
        })
      );

      const result =
        await LazarvClient.createFromReadableStream(forConsumption);

      expect(result.type).toBe("div");
      expect(result.props.className).toBe("complex");
      expect(result.props["data-id"]).toBe(123);
      expect(result.props.style).toEqual({ color: "red", fontSize: "14px" });
      expect(result.props.children).toHaveLength(2);
    }
  );

  test.skipIf(skipTests)(
    "React prerender with special types should be decodable by lazarv",
    async () => {
      const data = {
        date: new Date("2024-01-01T00:00:00.000Z"),
        bigint: BigInt(12345678901234567890n),
        map: new Map([
          ["key1", "value1"],
          ["key2", "value2"],
        ]),
        set: new Set([1, 2, 3]),
      };

      const { prelude } = await ReactStaticEdge.prerender(data);
      const rawData = await streamToString(prelude);

      const { forConsumption } = teeStream(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(rawData));
            controller.close();
          },
        })
      );

      const result =
        await LazarvClient.createFromReadableStream(forConsumption);

      expect(result.date).toBeInstanceOf(Date);
      expect(result.date.toISOString()).toBe("2024-01-01T00:00:00.000Z");
      expect(result.bigint).toBe(BigInt(12345678901234567890n));
      expect(result.map).toBeInstanceOf(Map);
      expect(result.map.get("key1")).toBe("value1");
      expect(result.set).toBeInstanceOf(Set);
      expect(result.set.has(2)).toBe(true);
    }
  );
});
