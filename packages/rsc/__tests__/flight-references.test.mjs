/**
 * @lazarv/rsc - Flight Client/Server Reference Tests
 *
 * Tests for client references, server references, and module resolution
 */

import { describe, expect, it } from "vitest";

import { createFromReadableStream, encodeReply } from "../client/index.mjs";
import { decodeReply } from "../server/index.mjs";
import {
  createClientModuleProxy,
  createTemporaryReferenceSet,
  registerClientReference,
  registerServerReference,
  renderToReadableStream,
} from "../server/index.mjs";

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

describe("Client References - Registration", () => {
  it("should register a client reference", () => {
    function ClientComponent() {
      return "Client Component";
    }

    const ref = registerClientReference(
      ClientComponent,
      "client-components/Button.js",
      "default"
    );

    expect(ref).toBeDefined();
    expect(typeof ref).toBe("function");
  });

  it("should register named export client reference", () => {
    function NamedComponent() {
      return "Named";
    }

    const ref = registerClientReference(
      NamedComponent,
      "client-components/utils.js",
      "NamedComponent"
    );

    expect(ref).toBeDefined();
  });

  it("should preserve function name in client reference", () => {
    function MyButton() {
      return "Button";
    }

    const ref = registerClientReference(
      MyButton,
      "components/MyButton.js",
      "default"
    );

    // The reference should be callable
    expect(typeof ref).toBe("function");
  });
});

describe("Client References - Serialization", () => {
  it("should serialize client reference to protocol format", async () => {
    function ClientComponent() {
      return "Client";
    }

    const ref = registerClientReference(
      ClientComponent,
      "components/Client.js",
      "default"
    );

    const stream = renderToReadableStream({
      type: ref,
      props: { name: "test" },
    });

    const content = await streamToString(stream);

    // Should contain client reference marker
    expect(content).toContain("components/Client.js");
  });

  it("should serialize client reference with metadata", async () => {
    function Button() {}

    const ref = registerClientReference(
      Button,
      "ui/Button.client.js",
      "Button"
    );

    const stream = renderToReadableStream({
      component: ref,
    });

    const content = await streamToString(stream);
    expect(content).toContain("ui/Button.client.js");
    expect(content).toContain("Button");
  });
});

describe("Server References - Registration", () => {
  it("should register a server reference", () => {
    async function serverAction(_formData) {
      return { success: true };
    }

    const ref = registerServerReference(
      serverAction,
      "server-actions/submit.js",
      "submitForm"
    );

    expect(ref).toBeDefined();
    expect(typeof ref).toBe("function");
  });

  it("should register server action with bound args", () => {
    async function serverAction(id, _formData) {
      return { id, success: true };
    }

    const ref = registerServerReference(
      serverAction,
      "actions.js",
      "updateItem"
    );

    const bound = ref.bind(null, 123);
    expect(typeof bound).toBe("function");
  });
});

describe("Server References - Serialization", () => {
  it("should serialize server reference", async () => {
    async function handleSubmit() {
      return "submitted";
    }

    const ref = registerServerReference(
      handleSubmit,
      "actions/form.js",
      "handleSubmit"
    );

    const stream = renderToReadableStream({
      action: ref,
    });

    const content = await streamToString(stream);
    expect(content).toContain("actions/form.js");
  });
});

describe("Client Module Proxy", () => {
  it("should create a module proxy", () => {
    const proxy = createClientModuleProxy("components/Button.js");

    expect(proxy).toBeDefined();
    expect(typeof proxy).toBe("object");
  });

  it("should access exports through proxy", () => {
    const proxy = createClientModuleProxy("components/utils.js");

    // Accessing properties should create client references
    const Button = proxy.Button;
    const Icon = proxy.Icon;

    expect(Button).toBeDefined();
    expect(Icon).toBeDefined();
  });

  it("should support default export proxy", () => {
    const proxy = createClientModuleProxy("components/Card.js");

    const defaultExport = proxy.default;
    expect(defaultExport).toBeDefined();
  });

  it("should handle nested property access", () => {
    const proxy = createClientModuleProxy("ui/index.js");

    // This tests the proxy's ability to handle various access patterns
    const ref = proxy.SomeComponent;
    expect(ref).toBeDefined();
  });
});

describe("Temporary Reference Set", () => {
  it("should create a temporary reference set", () => {
    const refSet = createTemporaryReferenceSet();

    expect(refSet).toBeDefined();
  });

  it("should support object serialization with temp refs", async () => {
    const refSet = createTemporaryReferenceSet();

    // Non-serializable functions need temp ref to survive round-trip

    const stream = renderToReadableStream(
      { data: "value" },
      { temporaryReferences: refSet }
    );

    const result = await createFromReadableStream(stream);
    expect(result.data).toBe("value");
  });
});

describe("Reply Encoding - encodeReply", () => {
  it("should encode simple values", async () => {
    const encoded = await encodeReply("hello");
    expect(encoded).toBeDefined();
  });

  it("should encode objects", async () => {
    const encoded = await encodeReply({ name: "test", value: 42 });
    expect(encoded).toBeDefined();
  });

  it("should encode arrays", async () => {
    const encoded = await encodeReply([1, 2, 3, "four"]);
    expect(encoded).toBeDefined();
  });

  it("should encode FormData", async () => {
    const formData = new FormData();
    formData.append("field1", "value1");
    formData.append("field2", "value2");

    const encoded = await encodeReply(formData);
    expect(encoded).toBeDefined();
  });

  it("should encode File in FormData", async () => {
    const formData = new FormData();
    const file = new File(["content"], "test.txt", { type: "text/plain" });
    formData.append("file", file);

    const encoded = await encodeReply(formData);
    expect(encoded).toBeDefined();
  });

  it("should encode nested structures", async () => {
    const data = {
      user: {
        name: "Alice",
        preferences: {
          theme: "dark",
          notifications: true,
        },
      },
      items: [1, 2, 3],
    };

    const encoded = await encodeReply(data);
    expect(encoded).toBeDefined();
  });

  it("should encode Date objects", async () => {
    const data = {
      timestamp: new Date("2024-01-15"),
      name: "event",
    };

    const encoded = await encodeReply(data);
    expect(encoded).toBeDefined();
  });

  it("should encode Map and Set", async () => {
    const data = {
      map: new Map([["key", "value"]]),
      set: new Set([1, 2, 3]),
    };

    const encoded = await encodeReply(data);
    expect(encoded).toBeDefined();
  });
});

describe("Reply Decoding - decodeReply", () => {
  it("should decode encoded string", async () => {
    const original = "hello world";
    const encoded = await encodeReply(original);
    const decoded = await decodeReply(encoded);
    expect(decoded).toBe(original);
  });

  it("should decode encoded object", async () => {
    const original = { name: "test", value: 42 };
    const encoded = await encodeReply(original);
    const decoded = await decodeReply(encoded);
    expect(decoded).toEqual(original);
  });

  it("should decode encoded array", async () => {
    const original = [1, "two", true, null];
    const encoded = await encodeReply(original);
    const decoded = await decodeReply(encoded);
    expect(decoded).toEqual(original);
  });

  it("should decode FormData", async () => {
    const formData = new FormData();
    formData.append("name", "test");
    formData.append("count", "5");

    const encoded = await encodeReply(formData);
    const decoded = await decodeReply(encoded);

    expect(decoded).toBeInstanceOf(FormData);
    expect(decoded.get("name")).toBe("test");
    expect(decoded.get("count")).toBe("5");
  });

  it("should decode nested data", async () => {
    const original = {
      level1: {
        level2: {
          value: "deep",
        },
      },
    };

    const encoded = await encodeReply(original);
    const decoded = await decodeReply(encoded);
    expect(decoded).toEqual(original);
  });

  it("should round-trip Date objects", async () => {
    const original = { date: new Date("2024-06-15T12:00:00Z") };
    const encoded = await encodeReply(original);
    const decoded = await decodeReply(encoded);

    expect(decoded.date).toBeInstanceOf(Date);
    expect(decoded.date.toISOString()).toBe("2024-06-15T12:00:00.000Z");
  });

  it("should round-trip Map", async () => {
    const original = new Map([
      ["a", 1],
      ["b", 2],
    ]);

    const encoded = await encodeReply(original);
    const decoded = await decodeReply(encoded);

    expect(decoded).toBeInstanceOf(Map);
    expect(decoded.get("a")).toBe(1);
    expect(decoded.get("b")).toBe(2);
  });

  it("should round-trip Set", async () => {
    const original = new Set([1, 2, 3, "four"]);

    const encoded = await encodeReply(original);
    const decoded = await decodeReply(encoded);

    expect(decoded).toBeInstanceOf(Set);
    expect(decoded.has(1)).toBe(true);
    expect(decoded.has("four")).toBe(true);
  });
});

describe("Reply with Server References", () => {
  it("should handle server reference in reply context", async () => {
    async function serverAction() {
      return { result: "ok" };
    }

    const ref = registerServerReference(serverAction, "actions.js", "myAction");

    // When a server reference is part of the reply, it should be callable
    const data = { action: ref };

    // In a real scenario, this would be encoded and sent to client
    // then decoded on server to call the actual function
    expect(typeof data.action).toBe("function");
  });
});

describe("Module Resolution - Client", () => {
  it("should resolve client module by ID", async () => {
    const ClientComp = () => "Client";
    const ref = registerClientReference(
      ClientComp,
      "test-module.js",
      "ClientComp"
    );

    // Stream with client reference
    const stream = renderToReadableStream({ component: ref });

    // Create module resolver that provides the actual module
    const ssrManifest = {
      moduleMap: {
        "test-module.js": {
          ClientComp: {
            id: "test-module.js",
            name: "ClientComp",
            chunks: [],
          },
        },
      },
      moduleLoading: {
        prefix: "/",
      },
    };

    // When deserializing, the client reference should be preserved
    const result = await createFromReadableStream(stream, {
      ssrManifest,
      async loadClientModule(metadata) {
        if (metadata.id === "test-module.js") {
          return { ClientComp };
        }
        throw new Error(`Unknown module: ${metadata.id}`);
      },
    });

    // Result should contain reference info
    expect(result.component).toBeDefined();
  });
});

describe("Bound Server Actions", () => {
  it("should preserve bound arguments", async () => {
    const receivedArgs = [];

    async function serverAction(...args) {
      receivedArgs.push(...args);
      return { success: true };
    }

    const ref = registerServerReference(serverAction, "actions.js", "myAction");

    // Bind some arguments
    const bound = ref.bind(null, "arg1", 123);

    // Call the bound function
    await bound("final-arg");

    expect(receivedArgs).toEqual(["arg1", 123, "final-arg"]);
  });

  it("should serialize bound server action", async () => {
    async function updateItem(itemId, data) {
      return { itemId, data };
    }

    const ref = registerServerReference(updateItem, "crud.js", "updateItem");

    const boundAction = ref.bind(null, 42);

    const stream = renderToReadableStream({
      action: boundAction,
    });

    const content = await streamToString(stream);
    // Should contain the server reference
    expect(content).toContain("crud.js");
  });
});

describe("Client Reference SSR", () => {
  it("should support SSR for client references", async () => {
    function ClientButton({ label }) {
      return `<button>${label}</button>`;
    }

    const ref = registerClientReference(
      ClientButton,
      "Button.client.js",
      "default"
    );

    // In SSR mode, we should be able to render client references
    const stream = renderToReadableStream({
      $$typeof: Symbol.for("react.element"),
      type: ref,
      props: { label: "Click me" },
      key: null,
      ref: null,
    });

    const result = await createFromReadableStream(stream, {
      async loadClientModule() {
        // Return the actual component for SSR
        return { default: ClientButton };
      },
    });

    expect(result).toBeDefined();
  });
});

describe("Multiple References", () => {
  it("should handle multiple client references", async () => {
    const refs = {};

    for (let i = 0; i < 10; i++) {
      const comp = () => `Component ${i}`;
      refs[`Comp${i}`] = registerClientReference(
        comp,
        `components/comp${i}.js`,
        "default"
      );
    }

    const stream = renderToReadableStream({
      components: Object.values(refs),
    });

    const content = await streamToString(stream);

    // All component modules should be referenced
    for (let i = 0; i < 10; i++) {
      expect(content).toContain(`comp${i}.js`);
    }
  });

  it("should handle multiple server references", async () => {
    const actions = {};

    for (let i = 0; i < 5; i++) {
      const action = async () => ({ id: i });
      actions[`action${i}`] = registerServerReference(
        action,
        `actions/action${i}.js`,
        "default"
      );
    }

    const stream = renderToReadableStream(actions);
    const content = await streamToString(stream);

    // All action modules should be referenced
    for (let i = 0; i < 5; i++) {
      expect(content).toContain(`action${i}.js`);
    }
  });
});

describe("Reference Edge Cases", () => {
  it("should handle client reference with special characters in path", () => {
    const comp = () => "Special";

    const ref = registerClientReference(
      comp,
      "components/@ui/button-[variant].client.js",
      "Button"
    );

    expect(ref).toBeDefined();
  });

  it("should handle server reference with async function", () => {
    const asyncAction = async function submitAsync() {
      await Promise.resolve();
      return "done";
    };

    const ref = registerServerReference(
      asyncAction,
      "async-actions.js",
      "submitAsync"
    );

    expect(typeof ref).toBe("function");
  });

  it("should handle arrow function references", () => {
    const arrowFn = () => "arrow";

    const clientRef = registerClientReference(arrowFn, "arrow.js", "default");

    const serverRef = registerServerReference(
      arrowFn,
      "arrow-server.js",
      "default"
    );

    expect(clientRef).toBeDefined();
    expect(serverRef).toBeDefined();
  });
});

describe("Temporary References - Full Round-Trip", () => {
  it("should round-trip non-serializable function through temp refs", async () => {
    // Client side: encode a value containing a non-serializable callback
    const { createTemporaryReferenceSet: clientCreateTempRefs } =
      await import("../client/index.mjs");
    const clientTempRefs = clientCreateTempRefs();
    const originalCallback = () => "hello from client";
    const data = { name: "test", onAction: originalCallback };

    const encoded = await encodeReply(data, {
      temporaryReferences: clientTempRefs,
    });

    // The function should be stored in client temp refs as "$T"
    expect(clientTempRefs.size).toBeGreaterThan(0);

    // Server side: decode with server temp refs
    const serverTempRefs = createTemporaryReferenceSet();
    const decoded = await decodeReply(encoded, {
      temporaryReferences: serverTempRefs,
    });

    // The decoded value should have an opaque proxy for the callback
    expect(decoded.name).toBe("test");
    expect(typeof decoded.onAction).toBe("function"); // proxy looks like a function

    // The opaque proxy should be registered in server temp refs
    const tempRefId = serverTempRefs.get(decoded.onAction);
    expect(tempRefId).toBeDefined();

    // Server side: render to stream passing temp refs through
    const stream = renderToReadableStream(
      { name: decoded.name, handler: decoded.onAction },
      { temporaryReferences: serverTempRefs }
    );

    // Client side: decode the stream with original temp refs
    const result = await createFromReadableStream(stream, {
      temporaryReferences: clientTempRefs,
    });

    expect(result.name).toBe("test");
    // The handler should be the original callback recovered from temp refs
    expect(result.handler).toBe(originalCallback);
  });

  it("should round-trip React-like element through temp refs", async () => {
    const { createTemporaryReferenceSet: clientCreateTempRefs } =
      await import("../client/index.mjs");
    const clientTempRefs = clientCreateTempRefs();

    // Simulate a React element that can't be serialized to server
    const element = {
      $$typeof: Symbol.for("react.element"),
      type: "div",
      props: { children: "hello" },
      key: null,
      ref: null,
    };
    const data = { ui: element, label: "test" };

    const encoded = await encodeReply(data, {
      temporaryReferences: clientTempRefs,
    });

    // Server side: decode
    const serverTempRefs = createTemporaryReferenceSet();
    const decoded = await decodeReply(encoded, {
      temporaryReferences: serverTempRefs,
    });
    expect(decoded.label).toBe("test");

    // Server render passing it through
    const stream = renderToReadableStream(
      { label: decoded.label, ui: decoded.ui },
      { temporaryReferences: serverTempRefs }
    );

    // Client side: decode the stream
    const result = await createFromReadableStream(stream, {
      temporaryReferences: clientTempRefs,
    });

    expect(result.label).toBe("test");
    expect(result.ui).toBe(element); // original element recovered
  });

  it("should round-trip local symbol through temp refs", async () => {
    const { createTemporaryReferenceSet: clientCreateTempRefs } =
      await import("../client/index.mjs");
    const clientTempRefs = clientCreateTempRefs();

    const localSymbol = Symbol("local");
    const data = { tag: localSymbol, value: 42 };

    const encoded = await encodeReply(data, {
      temporaryReferences: clientTempRefs,
    });

    const serverTempRefs = createTemporaryReferenceSet();
    const decoded = await decodeReply(encoded, {
      temporaryReferences: serverTempRefs,
    });
    expect(decoded.value).toBe(42);

    const stream = renderToReadableStream(
      { tag: decoded.tag, result: decoded.value },
      { temporaryReferences: serverTempRefs }
    );

    const result = await createFromReadableStream(stream, {
      temporaryReferences: clientTempRefs,
    });

    expect(result.result).toBe(42);
    expect(result.tag).toBe(localSymbol);
  });

  it("should create a WeakMap on server and Map on client", () => {
    const {
      createTemporaryReferenceSet: clientCreateTempRefs,
    } = require("../client/index.mjs");
    const serverRefs = createTemporaryReferenceSet();
    const clientRefs = clientCreateTempRefs();

    // Server creates WeakMap (object → id)
    expect(serverRefs instanceof WeakMap).toBe(true);
    // Client creates Map (id → value)
    expect(clientRefs instanceof Map).toBe(true);
  });

  it("should throw when trying to read temp ref proxy properties on server", async () => {
    const { createTemporaryReferenceSet: clientCreateTempRefs } =
      await import("../client/index.mjs");
    const clientTempRefs = clientCreateTempRefs();

    const data = { action: () => {} };
    const encoded = await encodeReply(data, {
      temporaryReferences: clientTempRefs,
    });

    const serverTempRefs = createTemporaryReferenceSet();
    const decoded = await decodeReply(encoded, {
      temporaryReferences: serverTempRefs,
    });

    // The proxy should throw when trying to read properties
    expect(() => decoded.action.someProp).toThrow();
  });

  it("should handle nested objects and arrays through temp refs", async () => {
    const { createTemporaryReferenceSet: clientCreateTempRefs } =
      await import("../client/index.mjs");
    const clientTempRefs = clientCreateTempRefs();

    const fn1 = () => "first";
    const fn2 = () => "second";
    const data = {
      items: [
        { name: "a", handler: fn1 },
        { name: "b", handler: fn2 },
      ],
      meta: { count: 2 },
    };

    const encoded = await encodeReply(data, {
      temporaryReferences: clientTempRefs,
    });

    const serverTempRefs = createTemporaryReferenceSet();
    const decoded = await decodeReply(encoded, {
      temporaryReferences: serverTempRefs,
    });
    expect(decoded.items[0].name).toBe("a");
    expect(decoded.items[1].name).toBe("b");
    expect(decoded.meta.count).toBe(2);

    const stream = renderToReadableStream(decoded, {
      temporaryReferences: serverTempRefs,
    });

    const result = await createFromReadableStream(stream, {
      temporaryReferences: clientTempRefs,
    });

    expect(result.items[0].name).toBe("a");
    expect(result.items[0].handler).toBe(fn1);
    expect(result.items[1].name).toBe("b");
    expect(result.items[1].handler).toBe(fn2);
    expect(result.meta.count).toBe(2);
  });
});

describe("Bound Server Action Args", () => {
  // Helper: create a registered server ref with $$id and $$bound support
  function makeServerRef(id, boundArgs) {
    const fn = async (...args) => ({ id, args });
    fn.$$typeof = Symbol.for("react.server.reference");
    fn.$$id = id;
    fn.$$bound = boundArgs || null;
    fn.bind = (_, ...args) => {
      const newBound = (boundArgs || []).concat(args);
      return makeServerRef(id, newBound);
    };
    return fn;
  }

  describe("Flight stream (renderToReadableStream → createFromReadableStream)", () => {
    it("should serialize and deserialize server ref with bound args through flight", async () => {
      const ref = registerServerReference(
        async (id, name) => ({ id, name }),
        "actions/item.js",
        "updateItem"
      );
      ref.$$bound = ["item-123"];

      const stream = renderToReadableStream({ action: ref });
      const content = await streamToString(stream);

      // The stream should contain bound args
      expect(content).toContain("bound");
      expect(content).toContain("item-123");
    });

    it("should reconstruct bound server ref from flight stream with callServer", async () => {
      const ref = registerServerReference(
        async (id, name) => ({ id, name }),
        "actions/item.js",
        "update"
      );
      ref.$$bound = [42];

      const stream = renderToReadableStream({ action: ref });

      let capturedId, capturedArgs;
      const result = await createFromReadableStream(stream, {
        callServer(id, args) {
          capturedId = id;
          capturedArgs = args;
          return Promise.resolve("ok");
        },
      });

      // Invoke the deserialized action with additional args
      await result.action("extra");

      expect(capturedId).toBe("actions/item.js#update");
      // Bound arg (42) should be prepended
      expect(capturedArgs).toEqual([42, "extra"]);
    });

    it("should support .bind() on deserialized server action from flight", async () => {
      const ref = registerServerReference(
        async (x) => x,
        "actions/calc.js",
        "compute"
      );

      const stream = renderToReadableStream({ action: ref });

      let capturedArgs;
      const result = await createFromReadableStream(stream, {
        callServer(id, args) {
          capturedArgs = args;
          return Promise.resolve("ok");
        },
      });

      // Bind additional arg on the client side
      const bound = result.action.bind(null, "first");
      await bound("second");

      expect(capturedArgs).toEqual(["first", "second"]);
    });

    it("should chain .bind() calls on deserialized server action", async () => {
      const ref = registerServerReference(
        async (x) => x,
        "actions/chain.js",
        "run"
      );
      ref.$$bound = ["a"];

      const stream = renderToReadableStream({ action: ref });

      let capturedArgs;
      const result = await createFromReadableStream(stream, {
        callServer(id, args) {
          capturedArgs = args;
          return Promise.resolve("ok");
        },
      });

      // Chain bind on already-bound action
      const rebound = result.action.bind(null, "b");
      await rebound("c");

      expect(capturedArgs).toEqual(["a", "b", "c"]);
    });

    it("should support server-side chained .bind() and accumulate $$bound", () => {
      const ref = registerServerReference(
        async () => {},
        "actions/chain2.js",
        "run"
      );

      const b1 = ref.bind(null, "x");
      expect(b1.$$bound).toEqual(["x"]);
      expect(b1.$$id).toBe("actions/chain2.js#run");
      expect(b1.$$typeof).toBe(Symbol.for("react.server.reference"));

      const b2 = b1.bind(null, "y");
      expect(b2.$$bound).toEqual(["x", "y"]);
      expect(b2.$$id).toBe("actions/chain2.js#run");

      const b3 = b2.bind(null, "z");
      expect(b3.$$bound).toEqual(["x", "y", "z"]);
    });

    it("should stream server-side chained .bind() and prepend all bound args", async () => {
      const ref = registerServerReference(
        async () => {},
        "actions/chain3.js",
        "run"
      );

      const b1 = ref.bind(null, "first");
      const b2 = b1.bind(null, "second");

      const stream = renderToReadableStream({ action: b2 });

      let capturedArgs;
      const result = await createFromReadableStream(stream, {
        callServer(id, args) {
          capturedArgs = args;
          return Promise.resolve("ok");
        },
      });

      await result.action("call-arg");

      expect(capturedArgs).toEqual(["first", "second", "call-arg"]);
    });

    it("should support triple-chained server+client .bind()", async () => {
      const ref = registerServerReference(
        async () => {},
        "actions/chain4.js",
        "run"
      );

      // Server-side chain
      const serverBound = ref.bind(null, "s1").bind(null, "s2");

      const stream = renderToReadableStream({ action: serverBound });

      let capturedArgs;
      const result = await createFromReadableStream(stream, {
        callServer(id, args) {
          capturedArgs = args;
          return Promise.resolve("ok");
        },
      });

      // Client-side chain on top
      const clientBound = result.action.bind(null, "c1").bind(null, "c2");
      await clientBound("final");

      expect(capturedArgs).toEqual(["s1", "s2", "c1", "c2", "final"]);
    });
  });

  describe("encodeReply / decodeReply round-trip", () => {
    it("should encode server ref with $$bound as $h + FormData part", async () => {
      const ref = makeServerRef("actions/test.js#doStuff", ["arg1", 42]);
      const encoded = await encodeReply(ref);

      // Should produce FormData with $h reference (matching React's format)
      expect(encoded).toBeInstanceOf(FormData);
      const rootValue = JSON.parse(encoded.get("0"));
      expect(rootValue).toMatch(/^\$h/);

      // Verify the outlined part contains the server ref metadata
      const partId = parseInt(rootValue.slice(2), 16);
      const partPayload = JSON.parse(encoded.get("" + partId));
      expect(partPayload.id).toBe("actions/test.js#doStuff");
      expect(partPayload.bound).toEqual(["arg1", 42]);
    });

    it("should encode server ref without $$bound as $h + FormData part", async () => {
      const ref = makeServerRef("actions/test.js#simple");
      const encoded = await encodeReply(ref);

      // Even unbound refs produce FormData with $h (matching React)
      expect(encoded).toBeInstanceOf(FormData);
      const rootValue = JSON.parse(encoded.get("0"));
      expect(rootValue).toMatch(/^\$h/);

      const partId = parseInt(rootValue.slice(2), 16);
      const partPayload = JSON.parse(encoded.get("" + partId));
      expect(partPayload.id).toBe("actions/test.js#simple");
      expect(partPayload.bound).toBeNull();
    });

    it("should encode server ref with empty $$bound as $h + FormData part", async () => {
      const ref = makeServerRef("actions/test.js#nobound", []);
      const encoded = await encodeReply(ref);

      expect(encoded).toBeInstanceOf(FormData);
      const rootValue = JSON.parse(encoded.get("0"));
      expect(rootValue).toMatch(/^\$h/);

      const partId = parseInt(rootValue.slice(2), 16);
      const partPayload = JSON.parse(encoded.get("" + partId));
      expect(partPayload.id).toBe("actions/test.js#nobound");
      expect(partPayload.bound).toBeNull();
    });

    it("should decode bound server ref and bind args on server", async () => {
      const ref = makeServerRef("actions/test.js#withBound", ["hello", 99]);
      const encoded = await encodeReply(ref);

      let invokedWith;
      const decoded = await decodeReply(encoded, {
        moduleLoader: {
          loadServerAction(_id) {
            return (...args) => {
              invokedWith = args;
              return { ok: true };
            };
          },
        },
      });

      // decoded should be a function with bound args applied
      expect(typeof decoded).toBe("function");
      decoded("extra");
      expect(invokedWith).toEqual(["hello", 99, "extra"]);
    });

    it("should decode plain server ref without bound args", async () => {
      const ref = makeServerRef("actions/test.js#plain");
      const encoded = await encodeReply(ref);

      const decoded = await decodeReply(encoded, {
        moduleLoader: {
          loadServerAction(id) {
            expect(id).toBe("actions/test.js#plain");
            return () => "result";
          },
        },
      });

      expect(typeof decoded).toBe("function");
      expect(decoded()).toBe("result");
    });

    it("should encode bound ref inside array via encodeReply", async () => {
      const ref = makeServerRef("actions/arr.js#fn", ["bound1"]);
      const encoded = await encodeReply([ref, "other"]);

      // Array containing a server ref → FormData with $h part
      expect(encoded).toBeInstanceOf(FormData);
      const parsed = JSON.parse(encoded.get("0"));
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[1]).toBe("other");
      // First element should be $h reference
      expect(parsed[0]).toMatch(/^\$h/);

      const partId = parseInt(parsed[0].slice(2), 16);
      const partPayload = JSON.parse(encoded.get("" + partId));
      expect(partPayload.id).toBe("actions/arr.js#fn");
      expect(partPayload.bound).toEqual(["bound1"]);
    });

    it("should encode bound ref inside object via encodeReply", async () => {
      const ref = makeServerRef("actions/obj.js#fn", [true]);
      const encoded = await encodeReply({ action: ref, label: "click" });

      expect(encoded).toBeInstanceOf(FormData);
      const parsed = JSON.parse(encoded.get("0"));
      expect(parsed.label).toBe("click");
      expect(parsed.action).toMatch(/^\$h/);

      const partId = parseInt(parsed.action.slice(2), 16);
      const partPayload = JSON.parse(encoded.get("" + partId));
      expect(partPayload.id).toBe("actions/obj.js#fn");
      expect(partPayload.bound).toEqual([true]);
    });

    it("should handle async loadServerAction for bound args", async () => {
      const ref = makeServerRef("actions/async.js#fn", ["x"]);
      const encoded = await encodeReply(ref);

      const decoded = await decodeReply(encoded, {
        moduleLoader: {
          loadServerAction(_id) {
            // Return a promise (simulating async module loading)
            return Promise.resolve((...args) => args);
          },
        },
      });

      // decoded is a promise because loadServerAction returns a promise
      const fn = await decoded;
      expect(typeof fn).toBe("function");
      expect(fn("y")).toEqual(["x", "y"]);
    });
  });

  describe("Full round-trip: server render → client deserialize → encodeReply → decodeReply", () => {
    it("should preserve bound args through full flight + reply round-trip", async () => {
      const original = registerServerReference(
        async (userId, action, payload) => ({ userId, action, payload }),
        "actions/user.js",
        "performAction"
      );
      original.$$bound = ["user-42", "delete"];

      // Step 1: Server renders flight stream with bound server ref
      const stream = renderToReadableStream({ handler: original });

      // Step 2: Client deserializes
      let capturedId, capturedArgs;
      const clientResult = await createFromReadableStream(stream, {
        callServer(id, args) {
          capturedId = id;
          capturedArgs = args;
          return Promise.resolve("done");
        },
      });

      // Step 3: Client invokes with additional arg
      await clientResult.handler({ items: [1, 2] });

      // Verify bound args are prepended
      expect(capturedId).toBe("actions/user.js#performAction");
      expect(capturedArgs).toEqual(["user-42", "delete", { items: [1, 2] }]);
    });
  });

  describe("Exotic bound arg types via encodeReply/decodeReply", () => {
    it("should round-trip ArrayBuffer bound arg", async () => {
      const buf = new ArrayBuffer(4);
      new Uint8Array(buf).set([1, 2, 3, 4]);
      const ref = makeServerRef("actions/binary.js#fn", [buf]);

      const encoded = await encodeReply(ref);
      let invokedWith;
      const decoded = await decodeReply(encoded, {
        moduleLoader: {
          loadServerAction() {
            return (...args) => {
              invokedWith = args;
            };
          },
        },
      });
      decoded("extra");

      expect(invokedWith.length).toBe(2);
      expect(invokedWith[0]).toBeInstanceOf(ArrayBuffer);
      expect(new Uint8Array(invokedWith[0])).toEqual(
        new Uint8Array([1, 2, 3, 4])
      );
      expect(invokedWith[1]).toBe("extra");
    });

    it("should round-trip Uint8Array bound arg", async () => {
      const arr = new Uint8Array([10, 20, 30]);
      const ref = makeServerRef("actions/typed.js#fn", [arr]);

      const encoded = await encodeReply(ref);
      let invokedWith;
      const decoded = await decodeReply(encoded, {
        moduleLoader: {
          loadServerAction() {
            return (...args) => {
              invokedWith = args;
            };
          },
        },
      });
      decoded();

      expect(invokedWith.length).toBe(1);
      expect(invokedWith[0]).toBeInstanceOf(Uint8Array);
      expect(invokedWith[0]).toEqual(new Uint8Array([10, 20, 30]));
    });

    it("should round-trip Float64Array bound arg", async () => {
      const arr = new Float64Array([1.5, 2.5, 3.5]);
      const ref = makeServerRef("actions/float.js#fn", [arr]);

      const encoded = await encodeReply(ref);
      let invokedWith;
      const decoded = await decodeReply(encoded, {
        moduleLoader: {
          loadServerAction() {
            return (...args) => {
              invokedWith = args;
            };
          },
        },
      });
      decoded();

      expect(invokedWith[0]).toBeInstanceOf(Float64Array);
      expect(Array.from(invokedWith[0])).toEqual([1.5, 2.5, 3.5]);
    });

    it("should round-trip Int32Array bound arg", async () => {
      const arr = new Int32Array([-1, 0, 2147483647]);
      const ref = makeServerRef("actions/int.js#fn", [arr]);

      const encoded = await encodeReply(ref);
      let invokedWith;
      const decoded = await decodeReply(encoded, {
        moduleLoader: {
          loadServerAction() {
            return (...args) => {
              invokedWith = args;
            };
          },
        },
      });
      decoded();

      expect(invokedWith[0]).toBeInstanceOf(Int32Array);
      expect(Array.from(invokedWith[0])).toEqual([-1, 0, 2147483647]);
    });

    it("should round-trip DataView bound arg", async () => {
      const buf = new ArrayBuffer(4);
      const view = new DataView(buf);
      view.setUint8(0, 0xca);
      view.setUint8(1, 0xfe);
      const ref = makeServerRef("actions/dv.js#fn", [view]);

      const encoded = await encodeReply(ref);
      let invokedWith;
      const decoded = await decodeReply(encoded, {
        moduleLoader: {
          loadServerAction() {
            return (...args) => {
              invokedWith = args;
            };
          },
        },
      });
      decoded();

      expect(invokedWith[0]).toBeInstanceOf(DataView);
      expect(invokedWith[0].getUint8(0)).toBe(0xca);
      expect(invokedWith[0].getUint8(1)).toBe(0xfe);
    });

    it("should round-trip RegExp bound arg", async () => {
      const regex = /hello\s+world/gi;
      const ref = makeServerRef("actions/re.js#fn", [regex]);

      const encoded = await encodeReply(ref);
      let invokedWith;
      const decoded = await decodeReply(encoded, {
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
      expect(invokedWith[0].source).toBe("hello\\s+world");
      expect(invokedWith[0].flags).toBe("gi");
    });

    it("should round-trip Date bound arg", async () => {
      const date = new Date("2025-06-15T12:00:00Z");
      const ref = makeServerRef("actions/date.js#fn", [date]);

      const encoded = await encodeReply(ref);
      let invokedWith;
      const decoded = await decodeReply(encoded, {
        moduleLoader: {
          loadServerAction() {
            return (...args) => {
              invokedWith = args;
            };
          },
        },
      });
      decoded();

      expect(invokedWith[0]).toBeInstanceOf(Date);
      expect(invokedWith[0].toISOString()).toBe("2025-06-15T12:00:00.000Z");
    });

    it("should round-trip Map bound arg", async () => {
      const map = new Map([
        ["a", 1],
        ["b", 2],
      ]);
      const ref = makeServerRef("actions/map.js#fn", [map]);

      const encoded = await encodeReply(ref);
      let invokedWith;
      const decoded = await decodeReply(encoded, {
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
      expect(invokedWith[0].get("a")).toBe(1);
      expect(invokedWith[0].get("b")).toBe(2);
    });

    it("should round-trip Set bound arg", async () => {
      const set = new Set([1, "two", true]);
      const ref = makeServerRef("actions/set.js#fn", [set]);

      const encoded = await encodeReply(ref);
      let invokedWith;
      const decoded = await decodeReply(encoded, {
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
      expect(invokedWith[0].has(1)).toBe(true);
      expect(invokedWith[0].has("two")).toBe(true);
      expect(invokedWith[0].has(true)).toBe(true);
    });

    it("should round-trip URL bound arg", async () => {
      const url = new URL("https://example.com/path?q=1");
      const ref = makeServerRef("actions/url.js#fn", [url]);

      const encoded = await encodeReply(ref);
      let invokedWith;
      const decoded = await decodeReply(encoded, {
        moduleLoader: {
          loadServerAction() {
            return (...args) => {
              invokedWith = args;
            };
          },
        },
      });
      decoded();

      expect(invokedWith[0]).toBeInstanceOf(URL);
      expect(invokedWith[0].href).toBe("https://example.com/path?q=1");
    });

    it("should round-trip BigInt bound arg", async () => {
      const ref = makeServerRef("actions/big.js#fn", [
        123456789012345678901234567890n,
      ]);

      const encoded = await encodeReply(ref);
      let invokedWith;
      const decoded = await decodeReply(encoded, {
        moduleLoader: {
          loadServerAction() {
            return (...args) => {
              invokedWith = args;
            };
          },
        },
      });
      decoded();

      expect(invokedWith[0]).toBe(123456789012345678901234567890n);
    });

    it("should round-trip mixed exotic bound args", async () => {
      const buf = new Uint8Array([1, 2, 3]);
      const date = new Date("2025-01-01");
      const regex = /test/i;
      const ref = makeServerRef("actions/mix.js#fn", [buf, date, regex, 42n]);

      const encoded = await encodeReply(ref);
      let invokedWith;
      const decoded = await decodeReply(encoded, {
        moduleLoader: {
          loadServerAction() {
            return (...args) => {
              invokedWith = args;
            };
          },
        },
      });
      decoded("tail");

      expect(invokedWith.length).toBe(5);
      expect(invokedWith[0]).toBeInstanceOf(Uint8Array);
      expect(invokedWith[1]).toBeInstanceOf(Date);
      expect(invokedWith[2]).toBeInstanceOf(RegExp);
      expect(invokedWith[3]).toBe(42n);
      expect(invokedWith[4]).toBe("tail");
    });

    it("should round-trip nested object with exotic values as bound arg", async () => {
      const ref = makeServerRef("actions/nested.js#fn", [
        {
          buffer: new Uint8Array([5, 6]),
          date: new Date("2025-01-01"),
          tags: new Set(["a", "b"]),
        },
      ]);

      const encoded = await encodeReply(ref);
      let invokedWith;
      const decoded = await decodeReply(encoded, {
        moduleLoader: {
          loadServerAction() {
            return (...args) => {
              invokedWith = args;
            };
          },
        },
      });
      decoded();

      expect(invokedWith[0].buffer).toBeInstanceOf(Uint8Array);
      expect(invokedWith[0].buffer).toEqual(new Uint8Array([5, 6]));
      expect(invokedWith[0].date).toBeInstanceOf(Date);
      expect(invokedWith[0].tags).toBeInstanceOf(Set);
      expect(invokedWith[0].tags.has("a")).toBe(true);
    });

    it("should round-trip exotic bound args through flight stream", async () => {
      const ref = registerServerReference(
        async (buf, extra) => ({ buf, extra }),
        "actions/exotic-flight.js",
        "run"
      );
      ref.$$bound = [new Uint8Array([0xde, 0xad])];

      const stream = renderToReadableStream({ action: ref });
      const content = await streamToString(stream);

      // Flight stream uses React's binary row format for TypedArrays (":o" tag),
      // not the base64 $AT format used in encodeReply
      expect(content).toContain("bound");
      expect(content).toContain("actions/exotic-flight.js");
    });
  });
});
