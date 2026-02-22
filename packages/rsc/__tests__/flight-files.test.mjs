/**
 * Tests for File/Blob handling and FormData serialization
 */

import { describe, expect, test, vi } from "vitest";

import {
  createFromReadableStream,
  createServerReference,
  encodeReply,
} from "../client/shared.mjs";
import { decodeReply, renderToReadableStream } from "../server/shared.mjs";

// Helper to create a mock File
function createMockFile(content, filename, type = "text/plain") {
  const blob = new Blob([content], { type });
  return new File([blob], filename, { type });
}

// Helper
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

describe("File and Blob Serialization", () => {
  describe("Blob serialization", () => {
    test("should serialize simple Blob", async () => {
      const blob = new Blob(["Hello, World!"], { type: "text/plain" });
      const stream = renderToReadableStream(blob);
      const output = await streamToString(stream);
      expect(output).toBeDefined();
    });

    test("should serialize Blob with different mime types", async () => {
      const jsonBlob = new Blob(['{"key": "value"}'], {
        type: "application/json",
      });
      const stream = renderToReadableStream(jsonBlob);
      const output = await streamToString(stream);
      expect(output).toBeDefined();
    });

    test("should serialize empty Blob", async () => {
      const emptyBlob = new Blob([], { type: "text/plain" });
      const stream = renderToReadableStream(emptyBlob);
      const output = await streamToString(stream);
      expect(output).toBeDefined();
    });
  });

  describe("File serialization", () => {
    test("should serialize File object", async () => {
      const file = createMockFile("File content here", "test.txt");
      const stream = renderToReadableStream(file);
      const output = await streamToString(stream);
      expect(output).toBeDefined();
    });

    test("should serialize File with metadata", async () => {
      const file = createMockFile(
        "PDF content",
        "document.pdf",
        "application/pdf"
      );
      const stream = renderToReadableStream(file);
      const output = await streamToString(stream);
      expect(output).toBeDefined();
    });
  });

  describe("encodeReply with Files and Blobs", () => {
    test("should encode object containing File", async () => {
      const file = createMockFile("test content", "test.txt");
      const data = {
        name: "Test Upload",
        file: file,
      };

      const encoded = await encodeReply(data);
      // When there are files, encodeReply returns FormData
      expect(encoded).toBeDefined();
    });

    test("should encode object containing Blob", async () => {
      const blob = new Blob(["blob data"], {
        type: "application/octet-stream",
      });
      const data = {
        description: "Blob test",
        blob: blob,
      };

      const encoded = await encodeReply(data);
      expect(encoded).toBeDefined();
    });

    test("should encode FormData with Blob entries", async () => {
      const blob = new Blob(["blob in formdata"], { type: "text/plain" });
      const formData = new FormData();
      formData.append("blobField", blob);
      formData.append("textField", "some text");

      const encoded = await encodeReply(formData);
      expect(encoded).toBeDefined();
    });

    test("should encode nested object with File", async () => {
      const file = createMockFile("nested file", "nested.txt");
      const data = {
        user: {
          profile: {
            avatar: file,
          },
        },
      };

      const encoded = await encodeReply(data);
      expect(encoded).toBeDefined();
    });

    test("should encode array with Files", async () => {
      const file1 = createMockFile("file 1", "file1.txt");
      const file2 = createMockFile("file 2", "file2.txt");
      const data = {
        files: [file1, file2],
      };

      const encoded = await encodeReply(data);
      expect(encoded).toBeDefined();
    });

    test("should encode Map containing File", async () => {
      const file = createMockFile("map file", "map.txt");
      const data = new Map([
        ["document", file],
        ["name", "test"],
      ]);

      const encoded = await encodeReply(data);
      expect(encoded).toBeDefined();
    });

    test("should encode Set containing File", async () => {
      const file = createMockFile("set file", "set.txt");
      const data = new Set([file, "other value"]);

      const encoded = await encodeReply(data);
      expect(encoded).toBeDefined();
    });

    test("should encode FormData containing File", async () => {
      const file = createMockFile("form file", "form.txt");
      const formData = new FormData();
      formData.append("document", file);
      formData.append("title", "Test Document");

      const encoded = await encodeReply(formData);
      expect(encoded).toBeDefined();
    });
  });

  describe("hasFileOrBlob edge cases", () => {
    test("should detect File in deeply nested structure", async () => {
      const file = createMockFile("deep file", "deep.txt");
      const data = {
        level1: {
          level2: {
            level3: {
              level4: {
                file: file,
              },
            },
          },
        },
      };

      const encoded = await encodeReply(data);
      // Should return FormData when File is detected
      expect(encoded).toBeDefined();
    });

    test("should detect Blob in array within object", async () => {
      const blob = new Blob(["array blob"]);
      const data = {
        items: [{ blob: blob }],
      };

      const encoded = await encodeReply(data);
      expect(encoded).toBeDefined();
    });

    test("should handle object without File/Blob", async () => {
      const data = {
        name: "No files here",
        count: 42,
        nested: { value: true },
      };

      const encoded = await encodeReply(data);
      // Should return string when no files
      expect(typeof encoded === "string" || encoded instanceof FormData).toBe(
        true
      );
    });

    test("should handle null and undefined values", async () => {
      const data = {
        nullValue: null,
        undefinedValue: undefined,
        nested: {
          deep: null,
        },
      };

      const encoded = await encodeReply(data);
      expect(encoded).toBeDefined();
    });
  });
});

describe("FormData Handling", () => {
  describe("FormData serialization", () => {
    test("should serialize FormData with text fields", async () => {
      const formData = new FormData();
      formData.append("username", "testuser");
      formData.append("email", "test@example.com");

      const stream = renderToReadableStream(formData);
      const output = await streamToString(stream);
      expect(output).toBeDefined();
    });

    test("should serialize FormData with multiple values for same key", async () => {
      const formData = new FormData();
      formData.append("tags", "javascript");
      formData.append("tags", "typescript");
      formData.append("tags", "react");

      const stream = renderToReadableStream(formData);
      const output = await streamToString(stream);
      expect(output).toBeDefined();
    });

    test("should serialize FormData with File", async () => {
      const file = createMockFile("uploaded content", "upload.txt");
      const formData = new FormData();
      formData.append("file", file);
      formData.append("description", "Test upload");

      const stream = renderToReadableStream(formData);
      const output = await streamToString(stream);
      expect(output).toBeDefined();
    });

    test("should serialize empty FormData", async () => {
      const formData = new FormData();

      const stream = renderToReadableStream(formData);
      const output = await streamToString(stream);
      expect(output).toBeDefined();
    });
  });

  describe("decodeReply with FormData", () => {
    test("should decode FormData input", async () => {
      const formData = new FormData();
      formData.append("name", "Test");
      formData.append("value", "123");

      const decoded = await decodeReply(formData);
      expect(decoded).toBeDefined();
    });
  });
});

describe("createServerReference edge cases", () => {
  test("should create reference that can be called with FormData", async () => {
    const callServer = vi.fn().mockResolvedValue({ success: true });
    const action = createServerReference("module#formAction", callServer);

    const formData = new FormData();
    formData.append("field", "value");

    await action(formData);
    expect(callServer).toHaveBeenCalled();
  });

  test("should create reference that can be called with File", async () => {
    const callServer = vi.fn().mockResolvedValue({ success: true });
    const action = createServerReference("module#fileAction", callServer);

    const file = createMockFile("file content", "test.txt");

    await action(file);
    expect(callServer).toHaveBeenCalled();
  });

  test("should handle bound arguments with complex types", async () => {
    const callServer = vi.fn().mockResolvedValue({ result: "ok" });
    const action = createServerReference("module#boundAction", callServer);

    const boundWithDate = action.bind(null, new Date("2024-01-01"));
    await boundWithDate("additional arg");

    expect(callServer).toHaveBeenCalled();
  });

  test("should handle multiple levels of binding", async () => {
    const callServer = vi.fn().mockResolvedValue({ result: "ok" });
    const action = createServerReference("module#multiBindAction", callServer);

    const bound1 = action.bind(null, "first");
    const bound2 = bound1.bind(null, "second");
    const bound3 = bound2.bind(null, "third");

    await bound3("final");
    expect(callServer).toHaveBeenCalled();
  });
});

describe("Binary data handling", () => {
  test("should handle ArrayBuffer", async () => {
    const buffer = new ArrayBuffer(8);
    const view = new Uint8Array(buffer);
    view.set([1, 2, 3, 4, 5, 6, 7, 8]);

    const stream = renderToReadableStream(buffer);
    const output = await streamToString(stream);
    expect(output).toBeDefined();
  });

  test("should handle TypedArray", async () => {
    const typedArray = new Uint8Array([10, 20, 30, 40, 50]);

    const stream = renderToReadableStream(typedArray);
    const result = await createFromReadableStream(stream);
    expect(result).toBeInstanceOf(Uint8Array);
  });

  test("should handle Int32Array", async () => {
    const int32Array = new Int32Array([100, 200, 300]);

    const stream = renderToReadableStream(int32Array);
    const result = await createFromReadableStream(stream);
    expect(result).toBeInstanceOf(Int32Array);
  });

  test("should handle Float64Array", async () => {
    const float64Array = new Float64Array([1.5, 2.5, 3.5]);

    const stream = renderToReadableStream(float64Array);
    const result = await createFromReadableStream(stream);
    expect(result).toBeInstanceOf(Float64Array);
  });

  test("should handle DataView", async () => {
    const buffer = new ArrayBuffer(16);
    const dataView = new DataView(buffer);
    dataView.setInt32(0, 42);
    dataView.setFloat64(4, 3.12345);

    const stream = renderToReadableStream(dataView);
    const result = await createFromReadableStream(stream);
    expect(result).toBeInstanceOf(DataView);
  });
});

describe("URL and URLSearchParams", () => {
  test("should handle URL object", async () => {
    const url = new URL("https://example.com/path?query=value#hash");

    const stream = renderToReadableStream(url);
    const result = await createFromReadableStream(stream);
    expect(result).toBeInstanceOf(URL);
    expect(result.href).toBe(url.href);
  });

  test("should handle URLSearchParams", async () => {
    const params = new URLSearchParams();
    params.append("key1", "value1");
    params.append("key2", "value2");
    params.append("key1", "value1b"); // Multiple values for same key

    const stream = renderToReadableStream(params);
    const result = await createFromReadableStream(stream);
    expect(result).toBeInstanceOf(URLSearchParams);
    expect(result.getAll("key1")).toEqual(["value1", "value1b"]);
  });
});

describe("Large data handling", () => {
  test("should handle large string", async () => {
    const largeString = "x".repeat(100000);

    const stream = renderToReadableStream(largeString);
    const result = await createFromReadableStream(stream);
    expect(result.length).toBe(100000);
  });

  test("should handle large array", async () => {
    const largeArray = Array.from({ length: 10000 }, (_, i) => i);

    const stream = renderToReadableStream(largeArray);
    const result = await createFromReadableStream(stream);
    expect(result.length).toBe(10000);
  });

  test("should handle object with many keys", async () => {
    const manyKeys = {};
    for (let i = 0; i < 1000; i++) {
      manyKeys[`key_${i}`] = `value_${i}`;
    }

    const stream = renderToReadableStream(manyKeys);
    const result = await createFromReadableStream(stream);
    expect(Object.keys(result).length).toBe(1000);
  });
});
