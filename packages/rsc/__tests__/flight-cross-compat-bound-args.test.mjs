/**
 * Cross-compatibility tests for Bound Server Action Args between @lazarv/rsc and react-server-dom-webpack
 *
 * These tests verify that:
 * 1. registerServerReference produces structurally equivalent results ($$typeof, $$id, $$bound)
 * 2. .bind() behavior is equivalent between both libraries
 * 3. Both libraries handle the same value types within bound args (Date, BigInt, Map, Set, etc.)
 * 4. Each library's own bound-ref round-trip works (server render → client decode → callServer)
 * 5. encodeReply wire format comparison ($F vs $h) and semantic equivalence
 * 6. encodeReply → decodeReply within each library preserves bound args correctly
 *
 * NOTE: Wire-level cross-feeding of server references is NOT possible because React uses
 * "$h" + outlined FormData parts while @lazarv/rsc uses "$F" + inline JSON.
 * These tests focus on structural parity and behavioral equivalence.
 *
 * NOTE: React's server registerServerReference defines $$bound as configurable but not
 * writable, so we use .bind() to create bound versions instead of direct assignment.
 * React's client uses a WeakMap (knownServerReferences) rather than $$typeof on functions.
 *
 * Run with: NODE_OPTIONS='--conditions=react-server' pnpm test __tests__/flight-cross-compat-bound-args.test.mjs
 */

import { describe, expect, test } from "vitest";

// @lazarv/rsc imports
import * as LazarvServer from "../server/shared.mjs";
import * as LazarvClient from "../client/shared.mjs";

// Try to import react-server-dom-webpack
let ReactDomServer;
let ReactDomClient;
let skipTests = false;

try {
  ReactDomServer = await import("react-server-dom-webpack/server");
  ReactDomClient = await import("react-server-dom-webpack/client.browser");
} catch {
  skipTests = true;
  console.warn(
    "Skipping cross-compatibility bound args tests: react-server condition not enabled"
  );
  console.warn(
    "Run with: NODE_OPTIONS='--conditions=react-server' pnpm test __tests__/flight-cross-compat-bound-args.test.mjs"
  );
}

// Conditional describe that skips if react-server condition is not enabled
const describeIf = skipTests ? describe.skip : describe;

// React's SERVER_REFERENCE_TAG symbol (same as ours)
const REACT_SERVER_REFERENCE = Symbol.for("react.server.reference");

// Helper: create a lazarv-style server ref with optional bound args (for encodeReply tests)
function makeLazarvServerRef(id, boundArgs) {
  const fn = async (...args) => ({ id, args });
  fn.$$typeof = REACT_SERVER_REFERENCE;
  fn.$$id = id;
  fn.$$bound = boundArgs || null;
  fn.bind = function (_, ...newArgs) {
    const newBound = (boundArgs || []).concat(newArgs);
    return makeLazarvServerRef(id, newBound);
  };
  return fn;
}

describeIf("Bound Server Action Args Cross-Compatibility", () => {
  // ─────────────────────────────────────────────────────────────────────
  // registerServerReference structural parity
  // ─────────────────────────────────────────────────────────────────────
  describe("registerServerReference structural parity", () => {
    test("both server-side registerServerReference set $$typeof, $$id, $$bound", () => {
      const reactFn = ReactDomServer.registerServerReference(
        () => {},
        "actions.js",
        "doStuff"
      );
      const lazarvFn = LazarvServer.registerServerReference(
        () => {},
        "actions.js",
        "doStuff"
      );

      // Both should have the same $$typeof symbol
      expect(reactFn.$$typeof).toBe(REACT_SERVER_REFERENCE);
      expect(lazarvFn.$$typeof).toBe(REACT_SERVER_REFERENCE);

      // Both use "id#exportName" format
      expect(reactFn.$$id).toBe("actions.js#doStuff");
      expect(lazarvFn.$$id).toBe("actions.js#doStuff");

      // Both should have $$bound as null initially
      expect(reactFn.$$bound).toBeNull();
      expect(lazarvFn.$$bound).toBeNull();

      // Both should have a custom bind function
      expect(typeof reactFn.bind).toBe("function");
      expect(typeof lazarvFn.bind).toBe("function");
    });

    test("client-side: React uses WeakMap, lazarv uses $$typeof on function", () => {
      // React client uses registerServerReference which stores in knownServerReferences WeakMap
      const reactFn = async () => {};
      ReactDomClient.registerServerReference(reactFn, "actions.js#run");
      // React doesn't set $$typeof on the function (uses WeakMap internally), but does override bind
      expect(typeof reactFn.bind).toBe("function");

      // lazarv client uses createServerReference which sets $$typeof directly
      const lazarvRef = LazarvClient.createServerReference(
        "actions.js#run",
        () => {}
      );
      expect(lazarvRef.$$typeof).toBe(REACT_SERVER_REFERENCE);
      expect(lazarvRef.$$id).toBe("actions.js#run");
      expect(typeof lazarvRef.bind).toBe("function");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // .bind() behavior parity
  // ─────────────────────────────────────────────────────────────────────
  describe(".bind() behavior parity", () => {
    test("server-side .bind() creates bound ref in both libraries", async () => {
      const reactFn = ReactDomServer.registerServerReference(
        () => {},
        "act.js",
        "fn"
      );
      const lazarvFn = LazarvServer.registerServerReference(
        () => {},
        "act.js",
        "fn"
      );

      const reactBound = reactFn.bind(null, "a", "b");
      const lazarvBound = lazarvFn.bind(null, "a", "b");

      // Both bound versions should have $$typeof
      expect(reactBound.$$typeof).toBe(REACT_SERVER_REFERENCE);
      expect(lazarvBound.$$typeof).toBe(REACT_SERVER_REFERENCE);

      // React's $$bound is a Promise, lazarv's is an array
      if (reactBound.$$bound instanceof Promise) {
        const reactArgs = await reactBound.$$bound;
        expect(reactArgs).toEqual(["a", "b"]);
      } else {
        expect(reactBound.$$bound).toEqual(["a", "b"]);
      }
      expect(lazarvBound.$$bound).toEqual(["a", "b"]);
    });

    test("server-side chained .bind() accumulates across calls", async () => {
      const reactFn = ReactDomServer.registerServerReference(
        () => {},
        "chain.js",
        "fn"
      );
      const lazarvFn = LazarvServer.registerServerReference(
        () => {},
        "chain.js",
        "fn"
      );

      const r1 = reactFn.bind(null, "a");
      const r2 = r1.bind(null, "b");
      const l1 = lazarvFn.bind(null, "a");
      const l2 = l1.bind(null, "b");

      // Both should have accumulated ["a", "b"]
      if (r2.$$bound instanceof Promise) {
        const reactArgs = await r2.$$bound;
        expect(reactArgs).toEqual(["a", "b"]);
      } else {
        expect(r2.$$bound).toEqual(["a", "b"]);
      }
      expect(l2.$$bound).toEqual(["a", "b"]);
    });

    test("server-side .bind() preserves $$id across binds", () => {
      const reactFn = ReactDomServer.registerServerReference(
        () => {},
        "keep.js",
        "fn"
      );
      const lazarvFn = LazarvServer.registerServerReference(
        () => {},
        "keep.js",
        "fn"
      );

      const rb = reactFn.bind(null, 42);
      const lb = lazarvFn.bind(null, 42);

      expect(rb.$$id).toBe("keep.js#fn");
      expect(lb.$$id).toBe("keep.js#fn");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Flight stream: server render → client decode → callServer
  // ─────────────────────────────────────────────────────────────────────
  describe("flight stream bound-arg round-trip", () => {
    test("React: .bind() with bound args → render → client prepends args", async () => {
      const fn = ReactDomServer.registerServerReference(
        () => {},
        "react-act.js",
        "run"
      );
      const boundFn = fn.bind(null, "pre1", 42);

      const stream = ReactDomServer.renderToReadableStream(
        { action: boundFn },
        new Map()
      );

      let capturedId, capturedArgs;
      const result = await ReactDomClient.createFromReadableStream(stream, {
        callServer(id, args) {
          capturedId = id;
          capturedArgs = args;
          return Promise.resolve("ok");
        },
      });

      await result.action("extra");

      expect(capturedId).toBe("react-act.js#run");
      expect(capturedArgs).toEqual(["pre1", 42, "extra"]);
    });

    test("lazarv: .bind() with bound args → render → client prepends args", async () => {
      const fn = LazarvServer.registerServerReference(
        async () => {},
        "lz-act.js",
        "run"
      );
      const boundFn = fn.bind(null, "pre1", 42);

      const stream = LazarvServer.renderToReadableStream({ action: boundFn });

      let capturedId, capturedArgs;
      const result = await LazarvClient.createFromReadableStream(stream, {
        callServer(id, args) {
          capturedId = id;
          capturedArgs = args;
          return Promise.resolve("ok");
        },
      });

      await result.action("extra");

      expect(capturedId).toBe("lz-act.js#run");
      expect(capturedArgs).toEqual(["pre1", 42, "extra"]);
    });

    test("both produce identical callServer args for same bound values", async () => {
      // React
      const reactFn = ReactDomServer.registerServerReference(
        () => {},
        "cmp.js",
        "fn"
      );
      const reactBound = reactFn.bind(null, "hello", 99, true);

      const reactStream = ReactDomServer.renderToReadableStream(
        { action: reactBound },
        new Map()
      );

      let reactCallArgs;
      const reactResult = await ReactDomClient.createFromReadableStream(
        reactStream,
        {
          callServer(id, args) {
            reactCallArgs = args;
            return Promise.resolve("ok");
          },
        }
      );
      await reactResult.action("tail");

      // lazarv
      const lazarvFn = LazarvServer.registerServerReference(
        async () => {},
        "cmp.js",
        "fn"
      );
      const lazarvBound = lazarvFn.bind(null, "hello", 99, true);

      const lazarvStream = LazarvServer.renderToReadableStream({
        action: lazarvBound,
      });

      let lazarvCallArgs;
      const lazarvResult = await LazarvClient.createFromReadableStream(
        lazarvStream,
        {
          callServer(id, args) {
            lazarvCallArgs = args;
            return Promise.resolve("ok");
          },
        }
      );
      await lazarvResult.action("tail");

      expect(reactCallArgs).toEqual(lazarvCallArgs);
      expect(reactCallArgs).toEqual(["hello", 99, true, "tail"]);
    });

    test("both handle no-bound server ref identically", async () => {
      // React
      const reactFn = ReactDomServer.registerServerReference(
        () => {},
        "plain.js",
        "fn"
      );

      const reactStream = ReactDomServer.renderToReadableStream(
        { action: reactFn },
        new Map()
      );

      let reactCallArgs;
      const reactResult = await ReactDomClient.createFromReadableStream(
        reactStream,
        {
          callServer(id, args) {
            reactCallArgs = args;
            return Promise.resolve("ok");
          },
        }
      );
      await reactResult.action("arg1");

      // lazarv
      const lazarvFn = LazarvServer.registerServerReference(
        async () => {},
        "plain.js",
        "fn"
      );

      const lazarvStream = LazarvServer.renderToReadableStream({
        action: lazarvFn,
      });

      let lazarvCallArgs;
      const lazarvResult = await LazarvClient.createFromReadableStream(
        lazarvStream,
        {
          callServer(id, args) {
            lazarvCallArgs = args;
            return Promise.resolve("ok");
          },
        }
      );
      await lazarvResult.action("arg1");

      expect(reactCallArgs).toEqual(lazarvCallArgs);
      expect(reactCallArgs).toEqual(["arg1"]);
    });

    test("both support client-side .bind() on deserialized action", async () => {
      // React
      const reactFn = ReactDomServer.registerServerReference(
        () => {},
        "bind-test.js",
        "fn"
      );

      const reactStream = ReactDomServer.renderToReadableStream(
        { action: reactFn },
        new Map()
      );

      let reactCallArgs;
      const reactResult = await ReactDomClient.createFromReadableStream(
        reactStream,
        {
          callServer(id, args) {
            reactCallArgs = args;
            return Promise.resolve("ok");
          },
        }
      );
      const reactBound = reactResult.action.bind(null, "bound1");
      await reactBound("arg1");

      // lazarv
      const lazarvFn = LazarvServer.registerServerReference(
        async () => {},
        "bind-test.js",
        "fn"
      );

      const lazarvStream = LazarvServer.renderToReadableStream({
        action: lazarvFn,
      });

      let lazarvCallArgs;
      const lazarvResult = await LazarvClient.createFromReadableStream(
        lazarvStream,
        {
          callServer(id, args) {
            lazarvCallArgs = args;
            return Promise.resolve("ok");
          },
        }
      );
      const lazarvBound = lazarvResult.action.bind(null, "bound1");
      await lazarvBound("arg1");

      expect(reactCallArgs).toEqual(lazarvCallArgs);
      expect(reactCallArgs).toEqual(["bound1", "arg1"]);
    });

    test("both chain server-bound + client-bound args", async () => {
      // React: use .bind() to create server-bound ref
      const reactFn = ReactDomServer.registerServerReference(
        () => {},
        "dbl.js",
        "fn"
      );
      const reactServerBound = reactFn.bind(null, "server-bound");

      const reactStream = ReactDomServer.renderToReadableStream(
        { action: reactServerBound },
        new Map()
      );

      let reactCallArgs;
      const reactResult = await ReactDomClient.createFromReadableStream(
        reactStream,
        {
          callServer(id, args) {
            reactCallArgs = args;
            return Promise.resolve("ok");
          },
        }
      );
      const reactClientBound = reactResult.action.bind(null, "client-bound");
      await reactClientBound("call-arg");

      // lazarv
      const lazarvFn = LazarvServer.registerServerReference(
        async () => {},
        "dbl.js",
        "fn"
      );
      const lazarvServerBound = lazarvFn.bind(null, "server-bound");

      const lazarvStream = LazarvServer.renderToReadableStream({
        action: lazarvServerBound,
      });

      let lazarvCallArgs;
      const lazarvResult = await LazarvClient.createFromReadableStream(
        lazarvStream,
        {
          callServer(id, args) {
            lazarvCallArgs = args;
            return Promise.resolve("ok");
          },
        }
      );
      const lazarvClientBound = lazarvResult.action.bind(null, "client-bound");
      await lazarvClientBound("call-arg");

      expect(reactCallArgs).toEqual(lazarvCallArgs);
      expect(reactCallArgs).toEqual([
        "server-bound",
        "client-bound",
        "call-arg",
      ]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // encodeReply wire format comparison
  // ─────────────────────────────────────────────────────────────────────
  // Helper: send a server ref through React flight stream and get a client-side bound ref
  async function makeReactBoundRefViaStream(id, exportName, boundArgs) {
    const serverFn = ReactDomServer.registerServerReference(
      () => {},
      id,
      exportName
    );
    const serverBound = serverFn.bind(null, ...boundArgs);

    const stream = ReactDomServer.renderToReadableStream(
      { ref: serverBound },
      new Map()
    );

    const result = await ReactDomClient.createFromReadableStream(stream, {
      callServer(cid, args) {
        return Promise.resolve({ cid, args });
      },
    });
    return result.ref;
  }

  describe("encodeReply wire format", () => {
    test("both React and lazarv use $h + FormData for bound refs", async () => {
      // React: need to go through flight stream to get a properly registered bound ref
      const reactBound = await makeReactBoundRefViaStream("enc.js", "fn", [
        "arg1",
      ]);

      const reactEncoded = await ReactDomClient.encodeReply(reactBound);

      // React should produce FormData with $h reference
      expect(reactEncoded).toBeInstanceOf(FormData);
      const reactMainPart = reactEncoded.get("0");
      expect(reactMainPart).toContain("$h");

      // lazarv: use helper that sets $$typeof
      const lazarvRef = makeLazarvServerRef("enc.js#fn", ["arg1"]);
      const lazarvEncoded = await LazarvClient.encodeReply(lazarvRef);

      // lazarv should also produce FormData with $h reference (matching React)
      expect(lazarvEncoded).toBeInstanceOf(FormData);
      const lazarvMainPart = lazarvEncoded.get("0");
      expect(lazarvMainPart).toContain("$h");

      // Both encode $h references in the same format
    });

    test("both produce FormData with $h for unbound server ref", async () => {
      // React client
      const reactFn = async () => {};
      ReactDomClient.registerServerReference(reactFn, "simple.js#fn");

      const reactEncoded = await ReactDomClient.encodeReply(reactFn);

      // React produces FormData with $h even for unbound refs
      expect(reactEncoded).toBeInstanceOf(FormData);

      // lazarv
      const lazarvRef = makeLazarvServerRef("simple.js#fn");
      const lazarvEncoded = await LazarvClient.encodeReply(lazarvRef);

      // lazarv also produces FormData with $h for unbound refs (matching React)
      expect(lazarvEncoded).toBeInstanceOf(FormData);
      const lazarvRoot = JSON.parse(lazarvEncoded.get("0"));
      expect(lazarvRoot).toMatch(/^\$h/);
    });

    test("both encode Date in bound args via FormData parts", async () => {
      const date = new Date("2025-06-15T12:00:00Z");

      // Need to go through flight stream to get a properly registered bound ref
      const reactBound = await makeReactBoundRefViaStream("date.js", "fn", [
        date,
      ]);
      const reactEncoded = await ReactDomClient.encodeReply(reactBound);

      expect(reactEncoded).toBeInstanceOf(FormData);

      // lazarv also encodes Date via FormData parts
      const lazarvRef = makeLazarvServerRef("date.js#fn", [date]);
      const lazarvEncoded = await LazarvClient.encodeReply(lazarvRef);
      expect(lazarvEncoded).toBeInstanceOf(FormData);

      // Verify Date appears somewhere in the FormData parts
      let foundDate = false;
      for (const [, value] of lazarvEncoded.entries()) {
        if (typeof value === "string" && value.includes("2025-06-15")) {
          foundDate = true;
          break;
        }
      }
      expect(foundDate).toBe(true);
    });

    test("both encode BigInt in bound args via FormData parts", async () => {
      const big = 123456789012345678901234567890n;

      // Need to go through flight stream to get a properly registered bound ref
      const reactBound = await makeReactBoundRefViaStream("big.js", "fn", [
        big,
      ]);
      const reactEncoded = await ReactDomClient.encodeReply(reactBound);

      expect(reactEncoded).toBeInstanceOf(FormData);
      // Verify React's FormData contains $n somewhere
      let foundBigInt = false;
      for (const [, value] of reactEncoded.entries()) {
        if (typeof value === "string" && value.includes("$n")) {
          foundBigInt = true;
          break;
        }
      }
      expect(foundBigInt).toBe(true);

      // lazarv also uses $n for BigInt in FormData parts
      const lazarvRef = makeLazarvServerRef("big.js#fn", [big]);
      const lazarvEncoded = await LazarvClient.encodeReply(lazarvRef);
      expect(lazarvEncoded).toBeInstanceOf(FormData);

      let lazarvFoundBigInt = false;
      for (const [, value] of lazarvEncoded.entries()) {
        if (typeof value === "string" && value.includes("$n")) {
          lazarvFoundBigInt = true;
          break;
        }
      }
      expect(lazarvFoundBigInt).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Same-library encodeReply → decodeReply round-trip for bound refs
  // ─────────────────────────────────────────────────────────────────────
  describe("encodeReply → decodeReply round-trip within each library", () => {
    test("React: encodeReply bound ref → decodeReply restores bound args", async () => {
      // Need to go through flight stream to get a properly registered bound ref
      const bound = await makeReactBoundRefViaStream("rt.js", "fn", ["a", 42]);

      const encoded = await ReactDomClient.encodeReply(bound);

      // Decode on React server side
      const moduleMap = {
        "rt.js#fn": { id: "rt.js#fn", chunks: [], name: "", async: false },
      };
      const origRequire = globalThis.__webpack_require__;
      globalThis.__webpack_require__ = (id) => {
        return (...args) => ({ id, args });
      };
      try {
        const decoded = await ReactDomServer.decodeReply(encoded, moduleMap);
        expect(typeof decoded).toBe("function");
        const result = decoded("extra");
        expect(result.args).toEqual(["a", 42, "extra"]);
      } finally {
        if (origRequire !== undefined) {
          globalThis.__webpack_require__ = origRequire;
        } else {
          delete globalThis.__webpack_require__;
        }
      }
    });

    test("lazarv: encodeReply bound ref → decodeReply restores bound args", async () => {
      const ref = makeLazarvServerRef("rt.js#fn", ["a", 42]);

      const encoded = await LazarvClient.encodeReply(ref);

      let invokedWith;
      const decoded = await LazarvServer.decodeReply(encoded, {
        moduleLoader: {
          loadServerAction(id) {
            return (...args) => {
              invokedWith = args;
              return { id, args };
            };
          },
        },
      });

      expect(typeof decoded).toBe("function");
      decoded("extra");
      expect(invokedWith).toEqual(["a", 42, "extra"]);
    });

    test("React: encodeReply unbound ref → decodeReply produces function", async () => {
      const reactFn = async () => {};
      ReactDomClient.registerServerReference(reactFn, "ub.js#fn");

      const encoded = await ReactDomClient.encodeReply(reactFn);

      const moduleMap = {
        "ub.js#fn": { id: "ub.js#fn", chunks: [], name: "", async: false },
      };
      const origRequire = globalThis.__webpack_require__;
      globalThis.__webpack_require__ = (id) => {
        return (...args) => ({ id, args });
      };
      try {
        const decoded = await ReactDomServer.decodeReply(encoded, moduleMap);
        expect(typeof decoded).toBe("function");
        const result = decoded("only-arg");
        expect(result.args).toEqual(["only-arg"]);
      } finally {
        if (origRequire !== undefined) {
          globalThis.__webpack_require__ = origRequire;
        } else {
          delete globalThis.__webpack_require__;
        }
      }
    });

    test("lazarv: encodeReply unbound ref → decodeReply produces function", async () => {
      const ref = makeLazarvServerRef("ub.js#fn");

      const encoded = await LazarvClient.encodeReply(ref);

      const decoded = await LazarvServer.decodeReply(encoded, {
        moduleLoader: {
          loadServerAction(id) {
            expect(id).toBe("ub.js#fn");
            return (...args) => args;
          },
        },
      });

      expect(typeof decoded).toBe("function");
      expect(decoded("only-arg")).toEqual(["only-arg"]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Value type coverage in bound args: flight stream round-trip
  // ─────────────────────────────────────────────────────────────────────
  describe("bound arg value types through flight stream", () => {
    test("both handle Date in bound args via flight stream", async () => {
      const date = new Date("2025-01-15T00:00:00Z");

      // React: use .bind() to set bound args
      const reactFn = ReactDomServer.registerServerReference(
        () => {},
        "dt.js",
        "fn"
      );
      const reactBound = reactFn.bind(null, date);

      const reactStream = ReactDomServer.renderToReadableStream(
        { action: reactBound },
        new Map()
      );
      let reactCallArgs;
      const rr = await ReactDomClient.createFromReadableStream(reactStream, {
        callServer(id, args) {
          reactCallArgs = args;
          return Promise.resolve("ok");
        },
      });
      await rr.action("end");

      // lazarv
      const lazarvFn = LazarvServer.registerServerReference(
        async () => {},
        "dt.js",
        "fn"
      );
      const lazarvBound = lazarvFn.bind(null, date);

      const lazarvStream = LazarvServer.renderToReadableStream({
        action: lazarvBound,
      });
      let lazarvCallArgs;
      const lr = await LazarvClient.createFromReadableStream(lazarvStream, {
        callServer(id, args) {
          lazarvCallArgs = args;
          return Promise.resolve("ok");
        },
      });
      await lr.action("end");

      expect(reactCallArgs[0]).toBeInstanceOf(Date);
      expect(lazarvCallArgs[0]).toBeInstanceOf(Date);
      expect(reactCallArgs[0].toISOString()).toBe(
        lazarvCallArgs[0].toISOString()
      );
      expect(reactCallArgs[1]).toBe("end");
      expect(lazarvCallArgs[1]).toBe("end");
    });

    test("both handle BigInt in bound args via flight stream", async () => {
      const bigVal = 9007199254740993n;

      // React
      const reactFn = ReactDomServer.registerServerReference(
        () => {},
        "bi.js",
        "fn"
      );
      const reactBound = reactFn.bind(null, bigVal);

      const reactStream = ReactDomServer.renderToReadableStream(
        { action: reactBound },
        new Map()
      );
      let reactCallArgs;
      const rr = await ReactDomClient.createFromReadableStream(reactStream, {
        callServer(id, args) {
          reactCallArgs = args;
          return Promise.resolve("ok");
        },
      });
      await rr.action();

      // lazarv
      const lazarvFn = LazarvServer.registerServerReference(
        async () => {},
        "bi.js",
        "fn"
      );
      const lazarvBound = lazarvFn.bind(null, bigVal);

      const lazarvStream = LazarvServer.renderToReadableStream({
        action: lazarvBound,
      });
      let lazarvCallArgs;
      const lr = await LazarvClient.createFromReadableStream(lazarvStream, {
        callServer(id, args) {
          lazarvCallArgs = args;
          return Promise.resolve("ok");
        },
      });
      await lr.action();

      expect(reactCallArgs[0]).toBe(bigVal);
      expect(lazarvCallArgs[0]).toBe(bigVal);
    });

    test("both handle Map in bound args via flight stream", async () => {
      const map = new Map([
        ["key1", "val1"],
        ["key2", 42],
      ]);

      // React
      const reactFn = ReactDomServer.registerServerReference(
        () => {},
        "map.js",
        "fn"
      );
      const reactBound = reactFn.bind(null, map);

      const reactStream = ReactDomServer.renderToReadableStream(
        { action: reactBound },
        new Map()
      );
      let reactCallArgs;
      const rr = await ReactDomClient.createFromReadableStream(reactStream, {
        callServer(id, args) {
          reactCallArgs = args;
          return Promise.resolve("ok");
        },
      });
      await rr.action();

      // lazarv
      const lazarvFn = LazarvServer.registerServerReference(
        async () => {},
        "map.js",
        "fn"
      );
      const lazarvBound = lazarvFn.bind(null, map);

      const lazarvStream = LazarvServer.renderToReadableStream({
        action: lazarvBound,
      });
      let lazarvCallArgs;
      const lr = await LazarvClient.createFromReadableStream(lazarvStream, {
        callServer(id, args) {
          lazarvCallArgs = args;
          return Promise.resolve("ok");
        },
      });
      await lr.action();

      expect(reactCallArgs[0]).toBeInstanceOf(Map);
      expect(lazarvCallArgs[0]).toBeInstanceOf(Map);
      expect(reactCallArgs[0].get("key1")).toBe("val1");
      expect(lazarvCallArgs[0].get("key1")).toBe("val1");
      expect(reactCallArgs[0].get("key2")).toBe(42);
      expect(lazarvCallArgs[0].get("key2")).toBe(42);
    });

    test("both handle Set in bound args via flight stream", async () => {
      const set = new Set([1, "two", true]);

      // React
      const reactFn = ReactDomServer.registerServerReference(
        () => {},
        "set.js",
        "fn"
      );
      const reactBound = reactFn.bind(null, set);

      const reactStream = ReactDomServer.renderToReadableStream(
        { action: reactBound },
        new Map()
      );
      let reactCallArgs;
      const rr = await ReactDomClient.createFromReadableStream(reactStream, {
        callServer(id, args) {
          reactCallArgs = args;
          return Promise.resolve("ok");
        },
      });
      await rr.action();

      // lazarv
      const lazarvFn = LazarvServer.registerServerReference(
        async () => {},
        "set.js",
        "fn"
      );
      const lazarvBound = lazarvFn.bind(null, set);

      const lazarvStream = LazarvServer.renderToReadableStream({
        action: lazarvBound,
      });
      let lazarvCallArgs;
      const lr = await LazarvClient.createFromReadableStream(lazarvStream, {
        callServer(id, args) {
          lazarvCallArgs = args;
          return Promise.resolve("ok");
        },
      });
      await lr.action();

      expect(reactCallArgs[0]).toBeInstanceOf(Set);
      expect(lazarvCallArgs[0]).toBeInstanceOf(Set);
      expect(reactCallArgs[0].has(1)).toBe(true);
      expect(lazarvCallArgs[0].has("two")).toBe(true);
      expect(lazarvCallArgs[0].has(true)).toBe(true);
    });

    test("both handle mixed value types in bound args", async () => {
      const date = new Date("2025-03-01");

      // React
      const reactFn = ReactDomServer.registerServerReference(
        () => {},
        "mix.js",
        "fn"
      );
      const reactBound = reactFn.bind(null, "text", 42, true, null, date, 100n);

      const reactStream = ReactDomServer.renderToReadableStream(
        { action: reactBound },
        new Map()
      );
      let reactCallArgs;
      const rr = await ReactDomClient.createFromReadableStream(reactStream, {
        callServer(id, args) {
          reactCallArgs = args;
          return Promise.resolve("ok");
        },
      });
      await rr.action("tail");

      // lazarv
      const lazarvFn = LazarvServer.registerServerReference(
        async () => {},
        "mix.js",
        "fn"
      );
      const lazarvBound = lazarvFn.bind(
        null,
        "text",
        42,
        true,
        null,
        date,
        100n
      );

      const lazarvStream = LazarvServer.renderToReadableStream({
        action: lazarvBound,
      });
      let lazarvCallArgs;
      const lr = await LazarvClient.createFromReadableStream(lazarvStream, {
        callServer(id, args) {
          lazarvCallArgs = args;
          return Promise.resolve("ok");
        },
      });
      await lr.action("tail");

      expect(reactCallArgs.length).toBe(7);
      expect(lazarvCallArgs.length).toBe(7);

      expect(reactCallArgs[0]).toBe("text");
      expect(lazarvCallArgs[0]).toBe("text");
      expect(reactCallArgs[1]).toBe(42);
      expect(lazarvCallArgs[1]).toBe(42);
      expect(reactCallArgs[2]).toBe(true);
      expect(lazarvCallArgs[2]).toBe(true);
      expect(reactCallArgs[3]).toBeNull();
      expect(lazarvCallArgs[3]).toBeNull();
      expect(reactCallArgs[4]).toBeInstanceOf(Date);
      expect(lazarvCallArgs[4]).toBeInstanceOf(Date);
      expect(reactCallArgs[4].toISOString()).toBe(
        lazarvCallArgs[4].toISOString()
      );
      expect(reactCallArgs[5]).toBe(100n);
      expect(lazarvCallArgs[5]).toBe(100n);
      expect(reactCallArgs[6]).toBe("tail");
      expect(lazarvCallArgs[6]).toBe("tail");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // encodeReply → decodeReply: exotic value types in bound args (lazarv)
  // ─────────────────────────────────────────────────────────────────────
  describe("encodeReply → decodeReply exotic bound arg types", () => {
    test("lazarv: Date in bound arg survives encodeReply → decodeReply", async () => {
      const date = new Date("2025-06-15T12:00:00Z");
      const ref = makeLazarvServerRef("exotic.js#fn", [date]);

      const encoded = await LazarvClient.encodeReply(ref);
      let invokedWith;
      const decoded = await LazarvServer.decodeReply(encoded, {
        moduleLoader: {
          loadServerAction() {
            return (...args) => {
              invokedWith = args;
            };
          },
        },
      });
      decoded("end");

      expect(invokedWith[0]).toBeInstanceOf(Date);
      expect(invokedWith[0].toISOString()).toBe("2025-06-15T12:00:00.000Z");
      expect(invokedWith[1]).toBe("end");
    });

    test("lazarv: BigInt in bound arg survives encodeReply → decodeReply", async () => {
      const ref = makeLazarvServerRef("exotic.js#fn", [999999999999999999n]);

      const encoded = await LazarvClient.encodeReply(ref);
      let invokedWith;
      const decoded = await LazarvServer.decodeReply(encoded, {
        moduleLoader: {
          loadServerAction() {
            return (...args) => {
              invokedWith = args;
            };
          },
        },
      });
      decoded();

      expect(invokedWith[0]).toBe(999999999999999999n);
    });

    test("lazarv: Map in bound arg survives encodeReply → decodeReply", async () => {
      const map = new Map([
        ["x", 1],
        ["y", 2],
      ]);
      const ref = makeLazarvServerRef("exotic.js#fn", [map]);

      const encoded = await LazarvClient.encodeReply(ref);
      let invokedWith;
      const decoded = await LazarvServer.decodeReply(encoded, {
        moduleLoader: {
          loadServerAction() {
            return (...args) => {
              invokedWith = args;
            };
          },
        },
      });
      decoded();

      expect(invokedWith[0]).toBeInstanceOf(Map);
      expect(invokedWith[0].get("x")).toBe(1);
      expect(invokedWith[0].get("y")).toBe(2);
    });

    test("lazarv: Set in bound arg survives encodeReply → decodeReply", async () => {
      const set = new Set(["a", "b", "c"]);
      const ref = makeLazarvServerRef("exotic.js#fn", [set]);

      const encoded = await LazarvClient.encodeReply(ref);
      let invokedWith;
      const decoded = await LazarvServer.decodeReply(encoded, {
        moduleLoader: {
          loadServerAction() {
            return (...args) => {
              invokedWith = args;
            };
          },
        },
      });
      decoded();

      expect(invokedWith[0]).toBeInstanceOf(Set);
      expect(invokedWith[0].has("a")).toBe(true);
      expect(invokedWith[0].has("b")).toBe(true);
      expect(invokedWith[0].has("c")).toBe(true);
    });

    test("lazarv: ArrayBuffer in bound arg survives encodeReply → decodeReply", async () => {
      const buf = new ArrayBuffer(4);
      new Uint8Array(buf).set([0xde, 0xad, 0xbe, 0xef]);
      const ref = makeLazarvServerRef("exotic.js#fn", [buf]);

      const encoded = await LazarvClient.encodeReply(ref);
      let invokedWith;
      const decoded = await LazarvServer.decodeReply(encoded, {
        moduleLoader: {
          loadServerAction() {
            return (...args) => {
              invokedWith = args;
            };
          },
        },
      });
      decoded();

      expect(invokedWith[0]).toBeInstanceOf(ArrayBuffer);
      expect(new Uint8Array(invokedWith[0])).toEqual(
        new Uint8Array([0xde, 0xad, 0xbe, 0xef])
      );
    });

    test("lazarv: Uint8Array in bound arg survives encodeReply → decodeReply", async () => {
      const arr = new Uint8Array([10, 20, 30]);
      const ref = makeLazarvServerRef("exotic.js#fn", [arr]);

      const encoded = await LazarvClient.encodeReply(ref);
      let invokedWith;
      const decoded = await LazarvServer.decodeReply(encoded, {
        moduleLoader: {
          loadServerAction() {
            return (...args) => {
              invokedWith = args;
            };
          },
        },
      });
      decoded();

      expect(invokedWith[0]).toBeInstanceOf(Uint8Array);
      expect(invokedWith[0]).toEqual(new Uint8Array([10, 20, 30]));
    });

    test("lazarv: RegExp in bound arg survives encodeReply → decodeReply", async () => {
      const regex = /test\d+/gi;
      const ref = makeLazarvServerRef("exotic.js#fn", [regex]);

      const encoded = await LazarvClient.encodeReply(ref);
      let invokedWith;
      const decoded = await LazarvServer.decodeReply(encoded, {
        moduleLoader: {
          loadServerAction() {
            return (...args) => {
              invokedWith = args;
            };
          },
        },
      });
      decoded();

      expect(invokedWith[0]).toBeInstanceOf(RegExp);
      expect(invokedWith[0].source).toBe("test\\d+");
      expect(invokedWith[0].flags).toBe("gi");
    });

    test("lazarv: mixed exotic bound args survive encodeReply → decodeReply", async () => {
      const date = new Date("2025-01-01");
      const buf = new Uint8Array([1, 2]);
      const regex = /hello/;
      const ref = makeLazarvServerRef("exotic.js#fn", [
        date,
        buf,
        regex,
        42n,
        new Map([["k", "v"]]),
        new Set([1]),
      ]);

      const encoded = await LazarvClient.encodeReply(ref);
      let invokedWith;
      const decoded = await LazarvServer.decodeReply(encoded, {
        moduleLoader: {
          loadServerAction() {
            return (...args) => {
              invokedWith = args;
            };
          },
        },
      });
      decoded("tail");

      expect(invokedWith.length).toBe(7);
      expect(invokedWith[0]).toBeInstanceOf(Date);
      expect(invokedWith[1]).toBeInstanceOf(Uint8Array);
      expect(invokedWith[2]).toBeInstanceOf(RegExp);
      expect(invokedWith[3]).toBe(42n);
      expect(invokedWith[4]).toBeInstanceOf(Map);
      expect(invokedWith[4].get("k")).toBe("v");
      expect(invokedWith[5]).toBeInstanceOf(Set);
      expect(invokedWith[5].has(1)).toBe(true);
      expect(invokedWith[6]).toBe("tail");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Full pipeline: server render → client decode → callServer
  // ─────────────────────────────────────────────────────────────────────
  describe("full pipeline: render → decode → callServer", () => {
    test("lazarv: full pipeline preserves server-bound + call args", async () => {
      const original = LazarvServer.registerServerReference(
        async () => {},
        "pipeline.js",
        "run"
      );
      const serverBound = original.bind(null, "user-42", "delete");

      const stream = LazarvServer.renderToReadableStream({
        handler: serverBound,
      });

      let capturedId, capturedArgs;
      const clientResult = await LazarvClient.createFromReadableStream(stream, {
        callServer(id, args) {
          capturedId = id;
          capturedArgs = args;
          return Promise.resolve("done");
        },
      });

      await clientResult.handler({ items: [1, 2] });

      expect(capturedId).toBe("pipeline.js#run");
      expect(capturedArgs).toEqual(["user-42", "delete", { items: [1, 2] }]);
    });

    test("React: full pipeline preserves server-bound + call args", async () => {
      const original = ReactDomServer.registerServerReference(
        () => {},
        "pipeline.js",
        "run"
      );
      const serverBound = original.bind(null, "user-42", "delete");

      const stream = ReactDomServer.renderToReadableStream(
        { handler: serverBound },
        new Map()
      );

      let capturedId, capturedArgs;
      const clientResult = await ReactDomClient.createFromReadableStream(
        stream,
        {
          callServer(id, args) {
            capturedId = id;
            capturedArgs = args;
            return Promise.resolve("done");
          },
        }
      );

      await clientResult.handler({ items: [1, 2] });

      expect(capturedId).toBe("pipeline.js#run");
      expect(capturedArgs).toEqual(["user-42", "delete", { items: [1, 2] }]);
    });
  });
});
