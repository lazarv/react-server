/**
 * Tests that the Flight deserializer rejects non-Flight input early
 * instead of silently buffering it. The parser is content-agnostic by
 * design (it just looks for row terminators), so an upstream regression
 * that returns HTML on a `.x-component` endpoint would otherwise stall
 * every consumer that awaits the resolved root value. The check is
 * deliberately scoped to a single byte peek — Flight rows always start
 * with an ASCII digit, and a `<` byte unambiguously means the producer
 * sent HTML/XML.
 */

import { describe, expect, test } from "vitest";

import {
  createFromFetch,
  createFromReadableStream,
} from "../client/shared.mjs";

function streamFromString(s) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    type: "bytes",
    start(controller) {
      controller.enqueue(encoder.encode(s));
      controller.close();
    },
  });
}

function streamFromBytes(bytes) {
  return new ReadableStream({
    type: "bytes",
    start(controller) {
      controller.enqueue(new Uint8Array(bytes));
      controller.close();
    },
  });
}

describe("Flight deserializer — non-Flight input rejection", () => {
  test("rejects an HTML doctype", async () => {
    const result = createFromReadableStream(
      streamFromString("<!doctype html><html><body><h1>oops</h1></body></html>")
    );
    await expect(result).rejects.toThrow(
      /Invalid RSC payload: response begins with '<' \(HTML\/XML\)/
    );
  });

  test("rejects a bare `<html>` tag", async () => {
    const result = createFromReadableStream(streamFromString("<html></html>"));
    await expect(result).rejects.toThrow(/Invalid RSC payload/);
  });

  test("rejects an XML preamble", async () => {
    const result = createFromReadableStream(
      streamFromString('<?xml version="1.0"?>')
    );
    await expect(result).rejects.toThrow(/Invalid RSC payload/);
  });

  test("rejects HTML through createFromFetch", async () => {
    const fakeResponse = {
      ok: true,
      status: 200,
      statusText: "OK",
      body: streamFromString("<html>error page</html>"),
    };
    const promise = createFromFetch(Promise.resolve(fakeResponse));
    await expect(promise).rejects.toThrow(/Invalid RSC payload/);
  });

  test("accepts a normal Flight stream (sanity check — the guard is byte-scoped)", async () => {
    // Minimal valid Flight: a single model row with a literal value.
    const result = createFromReadableStream(streamFromString('0:"hello"\n'));
    await expect(result).resolves.toBe("hello");
  });

  test("does not reject a Flight stream that legitimately starts with a digit", async () => {
    // Multi-digit row id — still must start with a digit (`1` here) and
    // must NOT trip the guard.
    const result = createFromReadableStream(streamFromString("123:42\n"));
    // The id is unimportant; what matters is that the guard does not
    // throw before processData has a chance to handle it.
    await expect(result).resolves.toBeDefined();
  });

  test("ignores leading empty chunk and validates the next non-empty one", async () => {
    // Some producers may emit a zero-length first chunk. The guard must
    // wait for the first non-empty chunk to make a decision.
    const stream = new ReadableStream({
      type: "bytes",
      start(controller) {
        controller.enqueue(new Uint8Array(0));
        controller.enqueue(new TextEncoder().encode('0:"ok"\n'));
        controller.close();
      },
    });
    await expect(createFromReadableStream(stream)).resolves.toBe("ok");
  });

  test("rejects a chunk that is just a `<` byte on its own", async () => {
    const result = createFromReadableStream(streamFromBytes([0x3c]));
    await expect(result).rejects.toThrow(/Invalid RSC payload/);
  });
});
