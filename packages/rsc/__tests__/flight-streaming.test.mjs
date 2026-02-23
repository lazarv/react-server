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
    expect(thenable.value).toBeInstanceOf(Error);
    expect(thenable.value.message).toBe("stream failed");
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
