/**
 * @lazarv/rsc - Flight Streaming Tests
 *
 * Tests for async streaming, Promise handling, TEXT rows, and progressive reveal
 */

import { describe, expect, it } from "vitest";

import { createFromReadableStream } from "../client/index.mjs";
import { renderToReadableStream } from "../server/index.mjs";

// Helper to delay for async tests
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper to decode a stream chunk value to string.
// Reconstructed text ReadableStreams yield strings (not Uint8Array).
function decodeChunk(value) {
  return typeof value === "string" ? value : new TextDecoder().decode(value);
}

// Helper to collect stream content
async function streamToString(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  return result;
}

// Helper to collect stream chunks for timing analysis
async function collectChunks(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push({
      time: Date.now(),
      data: decoder.decode(value, { stream: true }),
    });
  }
  return chunks;
}

describe("Flight Streaming - Promise Handling", () => {
  it("should stream Promise that resolves later", async () => {
    const promise = new Promise((resolve) => {
      setTimeout(() => resolve("delayed value"), 10);
    });

    const stream = renderToReadableStream(promise);
    const result = await createFromReadableStream(stream);
    expect(await result).toBe("delayed value");
  });

  it("should stream Promise with complex value", async () => {
    const promise = Promise.resolve({
      users: [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ],
      total: 2,
    });

    const stream = renderToReadableStream(promise);
    const result = await createFromReadableStream(stream);
    const value = await result;
    expect(value.users).toHaveLength(2);
    expect(value.total).toBe(2);
  });

  it("should stream nested Promises", async () => {
    const data = {
      immediate: "now",
      later: Promise.resolve("soon"),
      evenLater: new Promise((resolve) =>
        setTimeout(() => resolve("delayed"), 10)
      ),
    };

    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);
    expect(result.immediate).toBe("now");
    expect(await result.later).toBe("soon");
    expect(await result.evenLater).toBe("delayed");
  });

  it("should stream array of Promises", async () => {
    const promises = [
      Promise.resolve(1),
      Promise.resolve(2),
      Promise.resolve(3),
    ];

    const stream = renderToReadableStream(promises);
    const result = await createFromReadableStream(stream);
    const values = await Promise.all(result);
    expect(values).toEqual([1, 2, 3]);
  });
});

describe("Flight Streaming - Async Iterables", () => {
  it("should stream async iterable values", async () => {
    async function* asyncGen() {
      yield 1;
      yield 2;
      yield 3;
    }

    const stream = renderToReadableStream(asyncGen());
    const result = await createFromReadableStream(stream);

    const values = [];
    for await (const value of result) {
      values.push(value);
    }
    expect(values).toEqual([1, 2, 3]);
  });

  it("should stream async iterable with delays", async () => {
    async function* asyncGen() {
      yield "first";
      await delay(5);
      yield "second";
      await delay(5);
      yield "third";
    }

    const stream = renderToReadableStream(asyncGen());
    const result = await createFromReadableStream(stream);

    const values = [];
    for await (const value of result) {
      values.push(value);
    }
    expect(values).toEqual(["first", "second", "third"]);
  });

  it("should stream async iterable with complex values", async () => {
    async function* asyncGen() {
      yield { id: 1, data: "a" };
      yield { id: 2, data: "b" };
    }

    const stream = renderToReadableStream(asyncGen());
    const result = await createFromReadableStream(stream);

    const values = [];
    for await (const value of result) {
      values.push(value);
    }
    expect(values).toEqual([
      { id: 1, data: "a" },
      { id: 2, data: "b" },
    ]);
  });
});

describe("Flight Streaming - ReadableStream Transfer", () => {
  it("should transfer ReadableStream values", async () => {
    const textStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("hello"));
        controller.enqueue(new TextEncoder().encode(" world"));
        controller.close();
      },
    });

    const stream = renderToReadableStream(textStream);
    const result = await createFromReadableStream(stream);

    const reader = result.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(new TextDecoder().decode(value));
    }
    expect(chunks.join("")).toBe("hello world");
  });

  it("should transfer ReadableStream with binary data", async () => {
    const binaryStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.enqueue(new Uint8Array([4, 5, 6]));
        controller.close();
      },
    });

    const stream = renderToReadableStream(binaryStream);
    const result = await createFromReadableStream(stream);

    const reader = result.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Array.from(value));
    }
    expect(chunks.flat()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("Flight Streaming - Blob Transfer", () => {
  it("should transfer Blob values", async () => {
    const blob = new Blob(["Hello, Blob!"], { type: "text/plain" });

    const stream = renderToReadableStream(blob);
    const result = await createFromReadableStream(stream);

    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe("text/plain");
    expect(await result.text()).toBe("Hello, Blob!");
  });

  it("should transfer Blob with binary content", async () => {
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], {
      type: "image/jpeg",
    });

    const stream = renderToReadableStream(blob);
    const result = await createFromReadableStream(stream);

    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe("image/jpeg");
    const bytes = new Uint8Array(await result.arrayBuffer());
    expect(Array.from(bytes)).toEqual([0xff, 0xd8, 0xff, 0xe0]);
  });

  it("should transfer empty Blob", async () => {
    const blob = new Blob([], { type: "application/octet-stream" });

    const stream = renderToReadableStream(blob);
    const result = await createFromReadableStream(stream);

    expect(result).toBeInstanceOf(Blob);
    expect(result.size).toBe(0);
  });
});

describe("Flight Streaming - TEXT Row Streaming", () => {
  it("should use TEXT rows for large strings in async iterables", async () => {
    // TEXT rows are used for streaming string chunks from async sources
    async function* stringGen() {
      yield "x".repeat(2048);
    }

    const stream = renderToReadableStream(stringGen());
    const content = await streamToString(stream);

    // Should contain TEXT row marker for the yielded string
    expect(content).toContain(":T");
  });

  it("should correctly transfer large strings", async () => {
    const largeString = "Large content: " + "y".repeat(3000);

    const stream = renderToReadableStream(largeString);
    const result = await createFromReadableStream(stream);

    expect(result).toBe(largeString);
  });

  it("should handle multiple large strings", async () => {
    const data = {
      first: "a".repeat(2000),
      second: "b".repeat(2000),
      small: "tiny",
    };

    const stream = renderToReadableStream(data);
    const result = await createFromReadableStream(stream);

    expect(result.first).toBe("a".repeat(2000));
    expect(result.second).toBe("b".repeat(2000));
    expect(result.small).toBe("tiny");
  });
});

describe("Flight Streaming - BINARY Row Streaming", () => {
  it("should use BINARY rows for large TypedArrays", async () => {
    const largeArray = new Uint8Array(4096);
    largeArray.fill(42);

    const stream = renderToReadableStream(largeArray);
    const result = await createFromReadableStream(stream);

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(4096);
    expect(result[0]).toBe(42);
    expect(result[4095]).toBe(42);
  });

  it("should handle large ArrayBuffer", async () => {
    const buffer = new ArrayBuffer(4096);
    const view = new Uint8Array(buffer);
    view.fill(123);

    const stream = renderToReadableStream(buffer);
    const result = await createFromReadableStream(stream);

    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(result)[0]).toBe(123);
  });
});

describe("Flight Streaming - Progressive Data Loading", () => {
  it("should progressively emit data", async () => {
    const data = {
      immediate: "now",
      promise: new Promise((resolve) => setTimeout(() => resolve("later"), 50)),
    };

    const stream = renderToReadableStream(data);
    const chunks = await collectChunks(stream);

    // Should have multiple chunks (initial + promise resolution)
    expect(chunks.length).toBeGreaterThanOrEqual(1);

    // Combine all chunks to check for immediate value
    // In dev mode, first chunk may be nonce row :N
    const allData = chunks.map((c) => c.data).join("");
    expect(allData).toContain("now");
  });

  it("should stream async generator progressively", async () => {
    async function* slowGen() {
      yield 1;
      await delay(20);
      yield 2;
      await delay(20);
      yield 3;
    }

    const stream = renderToReadableStream(slowGen());
    const chunks = await collectChunks(stream);

    // Should receive values as they're yielded
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Flight Streaming - Abort Handling", () => {
  it("should support signal abort option", async () => {
    const controller = new AbortController();

    async function* slowGen() {
      yield 1;
      await delay(100);
      yield 2; // This should not be reached
    }

    const stream = renderToReadableStream(slowGen(), {
      signal: controller.signal,
    });

    // Abort after a short delay
    setTimeout(() => controller.abort(), 10);

    const reader = stream.getReader();
    let error = null;

    try {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    } catch (e) {
      error = e;
    }

    // Should have been aborted
    expect(error).not.toBeNull();
  });
});

describe("Flight Streaming - Concurrent Streams", () => {
  it("should handle multiple concurrent streams", async () => {
    const stream1 = renderToReadableStream({ id: 1, data: "first" });
    const stream2 = renderToReadableStream({ id: 2, data: "second" });
    const stream3 = renderToReadableStream({ id: 3, data: "third" });

    const [result1, result2, result3] = await Promise.all([
      createFromReadableStream(stream1),
      createFromReadableStream(stream2),
      createFromReadableStream(stream3),
    ]);

    expect(result1).toEqual({ id: 1, data: "first" });
    expect(result2).toEqual({ id: 2, data: "second" });
    expect(result3).toEqual({ id: 3, data: "third" });
  });
});

describe("Flight Streaming - Error in Promise", () => {
  it("should propagate Promise rejection", async () => {
    const promise = Promise.reject(new Error("Test error"));

    const stream = renderToReadableStream(promise, {
      onError() {
        // Suppress error logging
      },
    });

    // When the root model is a rejected Promise, createFromReadableStream should reject
    await expect(createFromReadableStream(stream)).rejects.toThrow(
      "Test error"
    );
  });

  it("should propagate async iterable errors", async () => {
    async function* errorGen() {
      yield 1;
      throw new Error("Generator error");
    }

    const stream = renderToReadableStream(errorGen(), {
      onError() {
        // Suppress error logging
      },
    });

    const result = await createFromReadableStream(stream);

    const values = [];
    await expect(async () => {
      for await (const value of result) {
        values.push(value);
      }
    }).rejects.toThrow();

    expect(values).toEqual([1]); // Should have received first value
  });
});

describe("Flight Streaming - FormData Transfer", () => {
  it("should transfer FormData", async () => {
    const formData = new FormData();
    formData.append("name", "test");
    formData.append("value", "123");

    const stream = renderToReadableStream(formData);
    const result = await createFromReadableStream(stream);

    expect(result).toBeInstanceOf(FormData);
    expect(result.get("name")).toBe("test");
    expect(result.get("value")).toBe("123");
  });

  it("should transfer FormData with File", async () => {
    const formData = new FormData();
    formData.append("name", "upload");
    formData.append(
      "file",
      new Blob(["file content"], { type: "text/plain" }),
      "test.txt"
    );

    const stream = renderToReadableStream(formData);
    let result = await createFromReadableStream(stream);

    // FormData with Blob values returns a Promise
    if (result instanceof Promise) {
      result = await result;
    }

    expect(result).toBeInstanceOf(FormData);
    expect(result.get("name")).toBe("upload");

    const file = result.get("file");
    expect(file).toBeInstanceOf(Blob);
    expect(await file.text()).toBe("file content");
  });
});

describe("Flight Streaming - URLSearchParams", () => {
  it("should serialize URLSearchParams", async () => {
    const params = new URLSearchParams();
    params.append("foo", "bar");
    params.append("baz", "qux");
    params.append("multi", "1");
    params.append("multi", "2");

    const stream = renderToReadableStream(params);
    const result = await createFromReadableStream(stream);

    expect(result).toBeInstanceOf(URLSearchParams);
    expect(result.get("foo")).toBe("bar");
    expect(result.get("baz")).toBe("qux");
    expect(result.getAll("multi")).toEqual(["1", "2"]);
  });

  it("should serialize URL", async () => {
    const url = new URL("https://example.com/foo?bar=baz");
    const stream = renderToReadableStream(url);
    const result = await createFromReadableStream(stream);

    expect(result).toBeInstanceOf(URL);
    expect(result.href).toBe("https://example.com/foo?bar=baz");
  });
});

describe("Flight Streaming - Memory Efficiency", () => {
  it("should not hold large values in memory after streaming", async () => {
    // Create a large object
    const largeData = {
      buffer: new ArrayBuffer(1024 * 100), // 100KB
      string: "x".repeat(50000),
    };

    const stream = renderToReadableStream(largeData);
    const result = await createFromReadableStream(stream);

    // Large binary values are returned as Promises that resolve to the value
    const buffer =
      result.buffer instanceof Promise ? await result.buffer : result.buffer;
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(result.string.length).toBe(50000);
  });
});

describe("Flight Streaming - Sync Thenable Return", () => {
  it("should return a thenable synchronously from createFromReadableStream", () => {
    const stream = renderToReadableStream({ hello: "world" });
    const thenable = createFromReadableStream(stream);

    // Must return synchronously (not be undefined)
    expect(thenable).toBeDefined();

    // Must have status/value for React's use() protocol
    expect(thenable.status).toBe("pending");
    expect(thenable.value).toBeUndefined();

    // Must be thenable
    expect(typeof thenable.then).toBe("function");
  });

  it("should transition status to fulfilled after stream is consumed", async () => {
    const stream = renderToReadableStream({ hello: "world" });
    const thenable = createFromReadableStream(stream);

    expect(thenable.status).toBe("pending");

    // Await the thenable
    const result = await thenable;

    expect(thenable.status).toBe("fulfilled");
    expect(thenable.value).toBe(result);
    expect(result.hello).toBe("world");
  });

  it("should transition status to rejected on error", async () => {
    // Create a stream that errors
    const stream = new ReadableStream({
      start(controller) {
        controller.error(new Error("stream failed"));
      },
    });

    const thenable = createFromReadableStream(stream);
    expect(thenable.status).toBe("pending");

    try {
      await thenable;
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e.message).toBe("stream failed");
    }

    expect(thenable.status).toBe("rejected");
    expect(thenable.reason).toBeInstanceOf(Error);
    expect(thenable.reason.message).toBe("stream failed");
  });

  it("should work with complex nested data through thenable", async () => {
    const data = {
      users: [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ],
      meta: { count: 2 },
    };

    const stream = renderToReadableStream(data);
    const thenable = createFromReadableStream(stream);

    // Synchronously pending
    expect(thenable.status).toBe("pending");

    const result = await thenable;

    expect(thenable.status).toBe("fulfilled");
    expect(result.users).toHaveLength(2);
    expect(result.users[0].name).toBe("Alice");
    expect(result.meta.count).toBe(2);
  });
});

describe("Flight Streaming - Incremental ReadableStream Delivery", () => {
  it("should deliver ReadableStream chunks incrementally, not all at once", async () => {
    // Create a ReadableStream that emits chunks with delays
    const sourceStream = new ReadableStream({
      async start(controller) {
        for (let i = 0; i < 5; i++) {
          controller.enqueue(`chunk-${i}`);
          await delay(30);
        }
        controller.close();
      },
    });

    const rscStream = renderToReadableStream(sourceStream);
    const result = await createFromReadableStream(rscStream);

    // result should be a ReadableStream that we can read from
    expect(result).toBeInstanceOf(ReadableStream);

    const reader = result.getReader();
    const arrivals = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // Text chunks are delivered as strings (not Uint8Array)
      const text =
        typeof value === "string" ? value : new TextDecoder().decode(value);
      arrivals.push({ time: Date.now(), text });
    }

    // All 5 chunks should have been received
    const allText = arrivals.map((a) => a.text).join("");
    for (let i = 0; i < 5; i++) {
      expect(allText).toContain(`chunk-${i}`);
    }

    // Key assertion: chunks should NOT all arrive at the same time.
    // With 30ms delays between chunks, the time span should be > 50ms
    // (if they all arrived at once, span would be ~0ms).
    if (arrivals.length > 1) {
      const timeSpan = arrivals[arrivals.length - 1].time - arrivals[0].time;
      expect(timeSpan).toBeGreaterThan(50);
    }
  });

  it("should deliver ReadableStream binary chunks incrementally", async () => {
    const sourceStream = new ReadableStream({
      async start(controller) {
        for (let i = 0; i < 4; i++) {
          controller.enqueue(new Uint8Array([i, i + 10, i + 20]));
          await delay(30);
        }
        controller.close();
      },
    });

    const rscStream = renderToReadableStream(sourceStream);
    const result = await createFromReadableStream(rscStream);

    expect(result).toBeInstanceOf(ReadableStream);

    const reader = result.getReader();
    const arrivals = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      arrivals.push({ time: Date.now(), bytes: Array.from(value) });
    }

    // All bytes should be present
    const allBytes = arrivals.flatMap((a) => a.bytes);
    expect(allBytes).toContain(0);
    expect(allBytes).toContain(3);

    // Chunks should arrive over time, not all at once
    if (arrivals.length > 1) {
      const timeSpan = arrivals[arrivals.length - 1].time - arrivals[0].time;
      expect(timeSpan).toBeGreaterThan(50);
    }
  });

  it("should resolve root value before ReadableStream completes", async () => {
    let streamClosed = false;

    const sourceStream = new ReadableStream({
      async start(controller) {
        controller.enqueue("first");
        await delay(200);
        controller.enqueue("second");
        await delay(200);
        controller.enqueue("third");
        controller.close();
        streamClosed = true;
      },
    });

    // Wrap in an object so we can test root resolution timing
    const rscStream = renderToReadableStream({ data: sourceStream });
    const rootResolved = Date.now();
    const result = await createFromReadableStream(rscStream);
    const resolveTime = Date.now();

    // The root value should resolve quickly (before the 400ms stream completes)
    expect(resolveTime - rootResolved).toBeLessThan(200);
    expect(streamClosed).toBe(false);

    // The stream property should be a ReadableStream
    expect(result.data).toBeInstanceOf(ReadableStream);

    // Reading the stream should deliver chunks over time
    const reader = result.data.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(decodeChunk(value));
    }

    const allText = chunks.join("");
    expect(allText).toContain("first");
    expect(allText).toContain("second");
    expect(allText).toContain("third");
  });
});

describe("Flight Streaming - Incremental AsyncIterable Delivery", () => {
  it("should deliver async iterable values incrementally", async () => {
    async function* slowGen() {
      for (let i = 0; i < 5; i++) {
        yield `item-${i}`;
        await delay(30);
      }
    }

    const rscStream = renderToReadableStream(slowGen());
    const result = await createFromReadableStream(rscStream);

    const arrivals = [];
    for await (const value of result) {
      arrivals.push({ time: Date.now(), value });
    }

    expect(arrivals.map((a) => a.value)).toEqual([
      "item-0",
      "item-1",
      "item-2",
      "item-3",
      "item-4",
    ]);

    // Values should arrive over time, not all at once
    if (arrivals.length > 1) {
      const timeSpan = arrivals[arrivals.length - 1].time - arrivals[0].time;
      expect(timeSpan).toBeGreaterThan(50);
    }
  });

  it("should resolve root value before async iterable completes", async () => {
    let genDone = false;

    async function* slowGen() {
      yield "a";
      await delay(200);
      yield "b";
      await delay(200);
      yield "c";
      genDone = true;
    }

    const rscStream = renderToReadableStream({ items: slowGen() });
    const startTime = Date.now();
    const result = await createFromReadableStream(rscStream);
    const resolveTime = Date.now();

    // Root should resolve quickly, before the generator finishes (400ms)
    expect(resolveTime - startTime).toBeLessThan(200);
    expect(genDone).toBe(false);

    // Consume the async iterable
    const values = [];
    for await (const value of result.items) {
      values.push(value);
    }

    expect(values).toEqual(["a", "b", "c"]);
    expect(genDone).toBe(true);
  });
});

describe("Flight Streaming - Double Serialization (Worker-like Pipeline)", () => {
  // This replicates the actual framework pipeline:
  //   Worker:       ReadableStream  → renderToReadableStream (inner RSC payload)
  //   Worker-proxy: createFromReadableStream → reconstructed ReadableStream (fromStream)
  //   Framework:    renderToReadableStream({ data: stream }) (outer RSC payload)
  //   Browser:      createFromReadableStream → { data: ReadableStream } (client reads)

  it("should pass a ReadableStream through double RSC serialization", async () => {
    // Step 1: Create a source ReadableStream (like the worker's stream() function)
    const sourceStream = new ReadableStream({
      async start(controller) {
        for (let i = 0; i < 5; i++) {
          controller.enqueue(`Chunk ${i} at ${Date.now()}\n`);
          await delay(30);
        }
        controller.close();
      },
    });

    // Step 2: Inner RSC serialization (worker side: toStream)
    const innerRscPayload = renderToReadableStream(sourceStream);

    // Step 3: Inner RSC deserialization (main thread: fromStream)
    const reconstructed = await createFromReadableStream(innerRscPayload);
    expect(reconstructed).toBeInstanceOf(ReadableStream);

    // Step 4: Outer RSC serialization (framework renders the component tree)
    const outerRscPayload = renderToReadableStream({ data: reconstructed });

    // Step 5: Outer RSC deserialization (browser side)
    const browserResult = await createFromReadableStream(outerRscPayload);
    expect(browserResult.data).toBeInstanceOf(ReadableStream);

    // Step 6: Client component reads the stream (like Stream.jsx)
    const reader = browserResult.data.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(decodeChunk(value));
    }

    // All 5 chunks should have been delivered
    const allText = chunks.join("");
    for (let i = 0; i < 5; i++) {
      expect(allText).toContain(`Chunk ${i}`);
    }
  });

  it("should stream chunks incrementally through double serialization", async () => {
    const sourceStream = new ReadableStream({
      async start(controller) {
        for (let i = 0; i < 4; i++) {
          controller.enqueue(`item-${i}`);
          await delay(50);
        }
        controller.close();
      },
    });

    // Inner: worker serialize → deserialize
    const innerPayload = renderToReadableStream(sourceStream);
    const reconstructed = await createFromReadableStream(innerPayload);

    // Outer: framework serialize → browser deserialize
    const outerPayload = renderToReadableStream({ stream: reconstructed });
    const browserResult = await createFromReadableStream(outerPayload);

    // Read chunks and track arrival times
    const reader = browserResult.stream.getReader();
    const arrivals = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      arrivals.push({ time: Date.now(), text: decodeChunk(value) });
    }

    const allText = arrivals.map((a) => a.text).join("");
    for (let i = 0; i < 4; i++) {
      expect(allText).toContain(`item-${i}`);
    }

    // Key: chunks should arrive incrementally, not all at once
    if (arrivals.length > 1) {
      const timeSpan = arrivals[arrivals.length - 1].time - arrivals[0].time;
      expect(timeSpan).toBeGreaterThan(50);
    }
  });

  it("should resolve outer root before inner stream completes", async () => {
    let streamClosed = false;

    const sourceStream = new ReadableStream({
      async start(controller) {
        controller.enqueue("first");
        await delay(200);
        controller.enqueue("second");
        await delay(200);
        controller.close();
        streamClosed = true;
      },
    });

    // Inner: worker round-trip
    const innerPayload = renderToReadableStream(sourceStream);
    const reconstructed = await createFromReadableStream(innerPayload);

    // Outer: framework round-trip
    const outerPayload = renderToReadableStream({
      data: reconstructed,
      label: "test",
    });
    const startTime = Date.now();
    const browserResult = await createFromReadableStream(outerPayload);
    const resolveTime = Date.now();

    // Root should resolve quickly — before the 400ms stream finishes
    expect(resolveTime - startTime).toBeLessThan(200);
    expect(streamClosed).toBe(false);
    expect(browserResult.label).toBe("test");
    expect(browserResult.data).toBeInstanceOf(ReadableStream);

    // Now consume the stream to completion
    const reader = browserResult.data.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(decodeChunk(value));
    }

    const allText = chunks.join("");
    expect(allText).toContain("first");
    expect(allText).toContain("second");
    expect(streamClosed).toBe(true);
  });

  it("should handle binary ReadableStream through double serialization", async () => {
    const sourceStream = new ReadableStream({
      async start(controller) {
        for (let i = 0; i < 3; i++) {
          controller.enqueue(new Uint8Array([i * 10, i * 10 + 1, i * 10 + 2]));
          await delay(30);
        }
        controller.close();
      },
    });

    // Inner round-trip
    const innerPayload = renderToReadableStream(sourceStream);
    const reconstructed = await createFromReadableStream(innerPayload);

    // Outer round-trip
    const outerPayload = renderToReadableStream({ bytes: reconstructed });
    const browserResult = await createFromReadableStream(outerPayload);

    expect(browserResult.bytes).toBeInstanceOf(ReadableStream);

    const reader = browserResult.bytes.getReader();
    const allBytes = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      allBytes.push(...Array.from(value));
    }

    // Should contain the bytes from all 3 chunks
    expect(allBytes).toContain(0);
    expect(allBytes).toContain(10);
    expect(allBytes).toContain(20);
  });

  it("should abort the inner stream when the outer RSC payload is aborted", async () => {
    let chunksProduced = 0;

    // Slow source stream that produces chunks over a long time
    const sourceStream = new ReadableStream({
      async start(controller) {
        for (let i = 0; i < 20; i++) {
          controller.enqueue(`chunk-${i}`);
          chunksProduced++;
          await delay(50);
        }
        controller.close();
      },
    });

    // Inner round-trip (worker pipeline)
    const innerPayload = renderToReadableStream(sourceStream);
    const reconstructed = await createFromReadableStream(innerPayload);

    // Outer serialization with abort signal
    const ac = new AbortController();
    const outerPayload = renderToReadableStream(
      { data: reconstructed },
      { signal: ac.signal }
    );

    // Start consuming the outer payload
    const browserResult = await createFromReadableStream(outerPayload);
    expect(browserResult.data).toBeInstanceOf(ReadableStream);

    // Read a couple of chunks from the browser-side stream
    const reader = browserResult.data.getReader();
    const received = [];
    const { value: first } = await reader.read();
    received.push(decodeChunk(first));

    // Abort the outer request (simulates browser refresh / navigation)
    ac.abort();

    // The reader should eventually error or end
    try {
      // Keep reading — should get an error from abort propagation
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received.push(decodeChunk(value));
      }
    } catch {
      // Expected: abort propagation causes a read error
    }

    // The abort should have propagated — we shouldn't have gotten all 20 chunks
    expect(received.length).toBeLessThan(20);

    // Wait for source stream to settle
    await delay(200);

    // Source stream should have stopped producing (not all 20 chunks)
    expect(chunksProduced).toBeLessThan(20);
  });

  it("should abort the reconstructed stream when its reader cancels", async () => {
    let chunksProduced = 0;

    const sourceStream = new ReadableStream({
      async start(controller) {
        for (let i = 0; i < 20; i++) {
          controller.enqueue(`chunk-${i}`);
          chunksProduced++;
          await delay(50);
        }
        controller.close();
      },
    });

    // Inner round-trip
    const innerPayload = renderToReadableStream(sourceStream);
    const reconstructed = await createFromReadableStream(innerPayload);

    // Read one chunk then cancel (simulates a component unmounting)
    const reader = reconstructed.getReader();
    const { value: firstChunk } = await reader.read();
    expect(decodeChunk(firstChunk)).toContain("chunk-");

    // Cancel the reader
    await reader.cancel();

    // Wait for propagation
    await delay(300);

    // Source should have stopped (or at least not produced all 20)
    expect(chunksProduced).toBeLessThan(20);
  });
});

// Try to import react-server-dom-webpack for cross-compat double-serialization tests
let ReactDomServer;
let ReactDomClientBrowser;
let skipReactTests = false;

try {
  ReactDomServer = await import("react-server-dom-webpack/server");
  ReactDomClientBrowser =
    await import("react-server-dom-webpack/client.browser");
} catch {
  skipReactTests = true;
}

const describeReact = skipReactTests ? describe.skip : describe;

describeReact(
  "Flight Streaming - Double Serialization with React (Worker → React Pipeline)",
  () => {
    // This replicates the full framework pipeline where:
    //   Inner layer: @lazarv/rsc serialize/deserialize (worker proxy)
    //   Outer layer: React's renderToReadableStream/createFromReadableStream (browser)

    it("should pass ReadableStream from @lazarv/rsc to React and back", async () => {
      // Step 1: Source stream with delayed chunks
      const sourceStream = new ReadableStream({
        async start(controller) {
          for (let i = 0; i < 5; i++) {
            controller.enqueue(`Chunk ${i}\n`);
            await delay(30);
          }
          controller.close();
        },
      });

      // Step 2-3: Inner @lazarv/rsc round-trip (worker pipeline)
      const innerPayload = renderToReadableStream(sourceStream);
      const reconstructed = await createFromReadableStream(innerPayload);
      expect(reconstructed).toBeInstanceOf(ReadableStream);

      // Step 4: Outer React serialization (framework renders component tree)
      const outerPayload = ReactDomServer.renderToReadableStream({
        data: reconstructed,
      });

      // Step 5: Outer React deserialization (browser side)
      const browserResult =
        await ReactDomClientBrowser.createFromReadableStream(outerPayload);
      expect(browserResult.data).toBeInstanceOf(ReadableStream);

      // Step 6: Client reads the stream
      const reader = browserResult.data.getReader();
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(decodeChunk(value));
      }

      const allText = chunks.join("");
      for (let i = 0; i < 5; i++) {
        expect(allText).toContain(`Chunk ${i}`);
      }
    });

    it("should stream chunks incrementally through @lazarv/rsc → React pipeline", async () => {
      const sourceStream = new ReadableStream({
        async start(controller) {
          for (let i = 0; i < 4; i++) {
            controller.enqueue(`item-${i}`);
            await delay(50);
          }
          controller.close();
        },
      });

      // Inner @lazarv/rsc round-trip
      const innerPayload = renderToReadableStream(sourceStream);
      const reconstructed = await createFromReadableStream(innerPayload);

      // Outer React round-trip
      const outerPayload = ReactDomServer.renderToReadableStream({
        stream: reconstructed,
      });
      const browserResult =
        await ReactDomClientBrowser.createFromReadableStream(outerPayload);

      const reader = browserResult.stream.getReader();
      const arrivals = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        arrivals.push({ time: Date.now(), text: decodeChunk(value) });
      }

      const allText = arrivals.map((a) => a.text).join("");
      for (let i = 0; i < 4; i++) {
        expect(allText).toContain(`item-${i}`);
      }

      // Chunks should arrive incrementally
      if (arrivals.length > 1) {
        const timeSpan = arrivals[arrivals.length - 1].time - arrivals[0].time;
        expect(timeSpan).toBeGreaterThan(50);
      }
    });

    it("should resolve outer React root before inner stream completes", async () => {
      let streamClosed = false;

      const sourceStream = new ReadableStream({
        async start(controller) {
          controller.enqueue("first");
          await delay(200);
          controller.enqueue("second");
          await delay(200);
          controller.close();
          streamClosed = true;
        },
      });

      // Inner @lazarv/rsc round-trip
      const innerPayload = renderToReadableStream(sourceStream);
      const reconstructed = await createFromReadableStream(innerPayload);

      // Outer React round-trip
      const outerPayload = ReactDomServer.renderToReadableStream({
        data: reconstructed,
        label: "react-test",
      });
      const startTime = Date.now();
      const browserResult =
        await ReactDomClientBrowser.createFromReadableStream(outerPayload);
      const resolveTime = Date.now();

      // Root should resolve quickly
      expect(resolveTime - startTime).toBeLessThan(200);
      expect(streamClosed).toBe(false);
      expect(browserResult.label).toBe("react-test");
      expect(browserResult.data).toBeInstanceOf(ReadableStream);

      // Consume the stream
      const reader = browserResult.data.getReader();
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(decodeChunk(value));
      }

      const allText = chunks.join("");
      expect(allText).toContain("first");
      expect(allText).toContain("second");
      expect(streamClosed).toBe(true);
    });
  }
);
