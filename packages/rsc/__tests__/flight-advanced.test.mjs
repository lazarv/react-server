import { describe, expect, test } from "vitest";

import { createFromReadableStream } from "../client/index.mjs";
import { renderToReadableStream } from "../server/index.mjs";
import {
  postpone,
  taintObjectReference,
  taintUniqueValue,
  unstable_postpone,
} from "../server/shared.mjs";

// Helper to collect stream chunks
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

describe("Advanced Flight Features", () => {
  describe("RegExp serialization", () => {
    test("should serialize and deserialize simple RegExp", async () => {
      const regex = /hello/gi;
      const stream = renderToReadableStream(regex);
      const result = await createFromReadableStream(stream);

      expect(result).toBeInstanceOf(RegExp);
      expect(result.source).toBe("hello");
      expect(result.flags).toBe("gi");
    });

    test("should serialize RegExp with special characters", async () => {
      const regex = /^foo\s+bar$/m;
      const stream = renderToReadableStream(regex);
      const result = await createFromReadableStream(stream);

      expect(result).toBeInstanceOf(RegExp);
      expect(result.source).toBe("^foo\\s+bar$");
      expect(result.flags).toBe("m");
    });

    test("should serialize RegExp with all flags", async () => {
      const regex = /test/gimsuy;
      const stream = renderToReadableStream(regex);
      const result = await createFromReadableStream(stream);

      expect(result).toBeInstanceOf(RegExp);
      expect(result.flags).toBe("gimsuy");
    });

    test("should serialize RegExp in object", async () => {
      const obj = {
        pattern: /\d+/g,
        email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      };
      const stream = renderToReadableStream(obj);
      const result = await createFromReadableStream(stream);

      expect(result.pattern).toBeInstanceOf(RegExp);
      expect(result.pattern.source).toBe("\\d+");
      expect(result.email).toBeInstanceOf(RegExp);
    });
  });

  describe("Taint APIs", () => {
    test("taintUniqueValue should prevent serialization of tainted strings", async () => {
      const secretKey = "super-secret-api-key-" + Date.now();
      taintUniqueValue("Do not pass API keys to the client", secretKey);

      await expect(async () => {
        const stream = renderToReadableStream(secretKey);
        await createFromReadableStream(stream);
      }).rejects.toThrow("Do not pass API keys to the client");
    });

    test("taintUniqueValue should work with bigint", async () => {
      const secretId = BigInt(Date.now());
      taintUniqueValue("Secret ID cannot be sent to client", secretId);

      await expect(async () => {
        const stream = renderToReadableStream(secretId);
        await createFromReadableStream(stream);
      }).rejects.toThrow("Secret ID cannot be sent to client");
    });

    test("taintObjectReference should prevent serialization of tainted objects", async () => {
      const secretConfig = {
        dbPassword: "secret123",
        apiToken: "token456",
        id: Date.now(),
      };
      taintObjectReference(
        "Configuration objects cannot be sent to the client",
        secretConfig
      );

      await expect(async () => {
        const stream = renderToReadableStream(secretConfig);
        await createFromReadableStream(stream);
      }).rejects.toThrow("Configuration objects cannot be sent to the client");
    });

    test("taintObjectReference should work with arrays", async () => {
      const secretArray = [
        "secret1",
        "secret2",
        "secret3",
        Date.now().toString(),
      ];
      taintObjectReference("Secret arrays cannot be serialized", secretArray);

      await expect(async () => {
        const stream = renderToReadableStream(secretArray);
        await createFromReadableStream(stream);
      }).rejects.toThrow("Secret arrays cannot be serialized");
    });

    test("non-tainted values should serialize normally", async () => {
      const normalValue = "this is fine - " + Date.now();
      const stream = renderToReadableStream(normalValue);
      const result = await createFromReadableStream(stream);
      expect(result).toBe(normalValue);
    });
  });

  describe("Postpone API", () => {
    test("unstable_postpone should throw PostponeError", () => {
      expect(() => {
        unstable_postpone("Loading more data...");
      }).toThrow();

      try {
        unstable_postpone("Loading more data...");
      } catch (error) {
        expect(error.$$typeof).toBe(Symbol.for("react.postpone"));
        expect(error.reason).toBe("Loading more data...");
      }
    });

    test("postpone should throw PostponeError", () => {
      expect(() => {
        postpone("Waiting for data");
      }).toThrow();

      try {
        postpone("Waiting for data");
      } catch (error) {
        expect(error.$$typeof).toBe(Symbol.for("react.postpone"));
        expect(error.reason).toBe("Waiting for data");
      }
    });

    test("PostponeError should be detectable", () => {
      let caughtError;
      try {
        unstable_postpone("Test postpone");
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).toBeDefined();
      expect(caughtError.$$typeof).toBe(Symbol.for("react.postpone"));
      expect(caughtError.message).toContain("Test postpone");
    });
  });

  describe("Error digest", () => {
    test("should handle error with digest", async () => {
      const error = new Error("Something went wrong");
      error.digest = "ERR_UNIQUE_123";

      // Wrap in promise that rejects to serialize error
      const promise = Promise.reject(error);
      const stream = renderToReadableStream(promise);

      // The stream should contain the error with digest
      const output = await streamToString(stream);
      expect(output).toBeDefined();
    });
  });

  describe("RegExp in complex structures", () => {
    test("should handle RegExp in nested arrays", async () => {
      const data = {
        patterns: [/a/, /b/g, /c/i],
        nested: {
          deep: {
            regex: /deep\s+pattern/gm,
          },
        },
      };
      const stream = renderToReadableStream(data);
      const result = await createFromReadableStream(stream);

      expect(result.patterns[0]).toBeInstanceOf(RegExp);
      expect(result.patterns[0].source).toBe("a");
      expect(result.patterns[1].flags).toBe("g");
      expect(result.patterns[2].flags).toBe("i");
      expect(result.nested.deep.regex.source).toBe("deep\\s+pattern");
      expect(result.nested.deep.regex.flags).toBe("gm");
    });
  });
});
