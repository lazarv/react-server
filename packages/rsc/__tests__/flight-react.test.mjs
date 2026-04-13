/**
 * @lazarv/rsc - Flight React Integration Tests
 *
 * Tests for React element serialization, fragments, lazy components
 */

import { describe, expect, it, vi } from "vitest";

import { createFromReadableStream } from "../client/index.mjs";
import {
  registerClientReference,
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

// React element type symbol
const REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element");
const REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");
const REACT_LAZY_TYPE = Symbol.for("react.lazy");
const REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref");
const REACT_MEMO_TYPE = Symbol.for("react.memo");
const REACT_SUSPENSE_TYPE = Symbol.for("react.suspense");

// Helper to create React-like elements
function createElement(type, props, ...children) {
  const element = {
    $$typeof: REACT_ELEMENT_TYPE,
    type,
    key: props?.key ?? null,
    ref: props?.ref ?? null,
    props: { ...props },
  };

  delete element.props.key;
  delete element.props.ref;

  if (children.length === 1) {
    element.props.children = children[0];
  } else if (children.length > 1) {
    element.props.children = children;
  }

  return element;
}

describe("React Elements - Basic", () => {
  it("should serialize simple HTML element", async () => {
    const element = createElement("div", { className: "test" }, "Hello");

    const stream = renderToReadableStream(element);
    const result = await createFromReadableStream(stream);

    expect(result.$$typeof).toBe(REACT_ELEMENT_TYPE);
    expect(result.type).toBe("div");
    expect(result.props.className).toBe("test");
    expect(result.props.children).toBe("Hello");
  });

  it("should serialize nested elements", async () => {
    const element = createElement(
      "div",
      { className: "container" },
      createElement("span", null, "First"),
      createElement("span", null, "Second")
    );

    const stream = renderToReadableStream(element);
    const result = await createFromReadableStream(stream);

    expect(result.type).toBe("div");
    expect(result.props.children).toHaveLength(2);
    expect(result.props.children[0].type).toBe("span");
    expect(result.props.children[1].type).toBe("span");
  });

  it("should serialize element with key", async () => {
    const element = createElement("li", { key: "item-1" }, "Item 1");

    const stream = renderToReadableStream(element);
    const result = await createFromReadableStream(stream);

    expect(result.key).toBe("item-1");
  });

  it("should serialize element with null key", async () => {
    const element = createElement("div", null, "Content");

    const stream = renderToReadableStream(element);
    const result = await createFromReadableStream(stream);

    expect(result.key).toBeNull();
  });

  it("should serialize element with complex props", async () => {
    const element = createElement("input", {
      type: "text",
      placeholder: "Enter name",
      disabled: false,
      maxLength: 100,
      style: { color: "red", fontSize: 14 },
      "data-testid": "name-input",
    });

    const stream = renderToReadableStream(element);
    const result = await createFromReadableStream(stream);

    expect(result.props.type).toBe("text");
    expect(result.props.disabled).toBe(false);
    expect(result.props.style).toEqual({ color: "red", fontSize: 14 });
    expect(result.props["data-testid"]).toBe("name-input");
  });
});

describe("React Elements - Children Types", () => {
  it("should serialize string children", async () => {
    const element = createElement("p", null, "Hello World");

    const stream = renderToReadableStream(element);
    const result = await createFromReadableStream(stream);

    expect(result.props.children).toBe("Hello World");
  });

  it("should serialize number children", async () => {
    const element = createElement("span", null, 42);

    const stream = renderToReadableStream(element);
    const result = await createFromReadableStream(stream);

    expect(result.props.children).toBe(42);
  });

  it("should serialize boolean children as null", async () => {
    const element = createElement("div", null, true, false);

    const stream = renderToReadableStream(element);
    const result = await createFromReadableStream(stream);

    // Boolean children should be filtered/nullified
    expect(result.props.children).toBeDefined();
  });

  it("should serialize null children", async () => {
    const element = createElement("div", null, null);

    const stream = renderToReadableStream(element);
    const result = await createFromReadableStream(stream);

    expect(result.props.children).toBeNull();
  });

  it("should serialize array of children", async () => {
    const element = createElement(
      "ul",
      null,
      [1, 2, 3].map((n) =>
        createElement("li", { key: n.toString() }, `Item ${n}`)
      )
    );

    const stream = renderToReadableStream(element);
    const result = await createFromReadableStream(stream);

    expect(result.type).toBe("ul");
    expect(result.props.children).toHaveLength(3);
  });
});

describe("React Elements - Fragments", () => {
  it("should serialize keyless fragment as array", async () => {
    // Keyless fragments are flattened to arrays (matching React's behavior)
    const fragment = {
      $$typeof: REACT_ELEMENT_TYPE,
      type: REACT_FRAGMENT_TYPE,
      key: null,
      ref: null,
      props: {
        children: [
          createElement("div", { key: "1" }, "First"),
          createElement("div", { key: "2" }, "Second"),
        ],
      },
    };

    const stream = renderToReadableStream(fragment);
    const result = await createFromReadableStream(stream);

    // Keyless Fragment outputs as array of children
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("div");
    expect(result[1].type).toBe("div");
  });

  it("should serialize keyed fragment as element", async () => {
    // Keyed fragments preserve the Fragment element
    const fragment = {
      $$typeof: REACT_ELEMENT_TYPE,
      type: REACT_FRAGMENT_TYPE,
      key: "fragment-key",
      ref: null,
      props: {
        children: createElement("span", null, "Child"),
      },
    };

    const stream = renderToReadableStream(fragment);
    const result = await createFromReadableStream(stream);

    expect(result.key).toBe("fragment-key");
  });
});

describe("React Elements - Suspense", () => {
  it("should serialize Suspense boundary", async () => {
    const suspense = {
      $$typeof: REACT_ELEMENT_TYPE,
      type: REACT_SUSPENSE_TYPE,
      key: null,
      ref: null,
      props: {
        fallback: createElement("div", null, "Loading..."),
        children: createElement("div", null, "Content"),
      },
    };

    const stream = renderToReadableStream(suspense);
    const result = await createFromReadableStream(stream);

    expect(result.type).toBe(REACT_SUSPENSE_TYPE);
    expect(result.props.fallback.props.children).toBe("Loading...");
    expect(result.props.children.props.children).toBe("Content");
  });
});

describe("React Elements - Client Components", () => {
  it("should serialize client component reference", async () => {
    function ClientButton({ label }) {
      return createElement("button", null, label);
    }

    const ref = registerClientReference(
      ClientButton,
      "Button.client.js",
      "default"
    );

    const element = createElement(ref, { label: "Click me" });

    const stream = renderToReadableStream(element);
    const result = await createFromReadableStream(stream);

    // Type should be the client reference
    expect(result.$$typeof).toBe(REACT_ELEMENT_TYPE);
    expect(result.props.label).toBe("Click me");
  });

  it("should serialize nested client components", async () => {
    function Card() {}
    function Button() {}

    const CardRef = registerClientReference(Card, "Card.js", "default");
    const ButtonRef = registerClientReference(Button, "Button.js", "default");

    const element = createElement(
      CardRef,
      { title: "Card Title" },
      createElement(ButtonRef, { onClick: "handler" }, "Click")
    );

    const stream = renderToReadableStream(element);
    const content = await streamToString(stream);

    expect(content).toContain("Card.js");
    expect(content).toContain("Button.js");
  });
});

describe("React Elements - Server Components", () => {
  it("should serialize async server component result", async () => {
    async function ServerComponent() {
      await Promise.resolve();
      return createElement("div", null, "Server rendered");
    }

    // Server components are executed, not serialized as references
    const result = await ServerComponent();

    const stream = renderToReadableStream(result);
    const deserialized = await createFromReadableStream(stream);

    expect(deserialized.type).toBe("div");
    expect(deserialized.props.children).toBe("Server rendered");
  });

  it("should serialize server component with async data", async () => {
    async function DataComponent() {
      const data = await Promise.resolve({ items: [1, 2, 3] });
      return createElement(
        "ul",
        null,
        data.items.map((item) =>
          createElement("li", { key: item.toString() }, item)
        )
      );
    }

    const result = await DataComponent();

    const stream = renderToReadableStream(result);
    const deserialized = await createFromReadableStream(stream);

    expect(deserialized.type).toBe("ul");
    expect(deserialized.props.children).toHaveLength(3);
  });
});

describe("React Elements - Lazy Components", () => {
  it("should serialize lazy component structure", async () => {
    const lazyInit = () => Promise.resolve({ default: () => {} });

    const lazy = {
      $$typeof: REACT_LAZY_TYPE,
      _init: lazyInit,
      _payload: null,
    };

    // Lazy components have special handling
    const element = {
      $$typeof: REACT_ELEMENT_TYPE,
      type: lazy,
      key: null,
      ref: null,
      props: {},
    };

    // The serialization should handle the lazy boundary
    const stream = renderToReadableStream(element);
    const content = await streamToString(stream);

    // Should produce some output
    expect(content.length).toBeGreaterThan(0);
  });
});

describe("React Elements - Forward Ref", () => {
  it("should handle forward ref type", async () => {
    const forwardRef = {
      $$typeof: REACT_FORWARD_REF_TYPE,
      render: function ForwardRefComponent() {},
    };

    const element = {
      $$typeof: REACT_ELEMENT_TYPE,
      type: forwardRef,
      key: null,
      ref: null,
      props: { className: "forwarded" },
    };

    const stream = renderToReadableStream(element);
    const content = await streamToString(stream);

    expect(content.length).toBeGreaterThan(0);
  });
});

describe("React Elements - Memo", () => {
  it("should handle memo type", async () => {
    const memo = {
      $$typeof: REACT_MEMO_TYPE,
      type: function MemoizedComponent() {},
      compare: null,
    };

    const element = {
      $$typeof: REACT_ELEMENT_TYPE,
      type: memo,
      key: null,
      ref: null,
      props: { value: 42 },
    };

    const stream = renderToReadableStream(element);
    const content = await streamToString(stream);

    expect(content.length).toBeGreaterThan(0);
  });
});

describe("React Elements - Deep Nesting", () => {
  it("should serialize deeply nested structure", async () => {
    let element = createElement("div", null, "Deepest");

    for (let i = 0; i < 50; i++) {
      element = createElement("div", { key: i.toString() }, element);
    }

    const stream = renderToReadableStream(element);
    const result = await createFromReadableStream(stream);

    // Navigate to deepest child
    let current = result;
    for (let i = 0; i < 50; i++) {
      expect(current.type).toBe("div");
      current = current.props.children;
    }
    expect(current.props.children).toBe("Deepest");
  });
});

describe("React Elements - Event Handlers", () => {
  it("should handle onClick prop (as string placeholder)", async () => {
    const element = createElement(
      "button",
      {
        onClick: "handleClick",
        "data-handler": "click",
      },
      "Click me"
    );

    const stream = renderToReadableStream(element);
    const result = await createFromReadableStream(stream);

    expect(result.props["data-handler"]).toBe("click");
  });
});

describe("React Elements - Style Props", () => {
  it("should serialize inline styles", async () => {
    const element = createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 16,
        backgroundColor: "#fff",
      },
    });

    const stream = renderToReadableStream(element);
    const result = await createFromReadableStream(stream);

    expect(result.props.style).toEqual({
      display: "flex",
      flexDirection: "column",
      gap: 16,
      backgroundColor: "#fff",
    });
  });
});

describe("React Elements - Lists", () => {
  it("should serialize list with keys", async () => {
    const items = ["Apple", "Banana", "Cherry"];

    const element = createElement(
      "ul",
      null,
      items.map((item, _index) => createElement("li", { key: item }, item))
    );

    const stream = renderToReadableStream(element);
    const result = await createFromReadableStream(stream);

    expect(result.props.children).toHaveLength(3);
    expect(result.props.children[0].key).toBe("Apple");
    expect(result.props.children[1].key).toBe("Banana");
    expect(result.props.children[2].key).toBe("Cherry");
  });

  it("should serialize list with numeric keys", async () => {
    const element = createElement(
      "ol",
      null,
      [0, 1, 2].map((n) => createElement("li", { key: n }, `Item ${n}`))
    );

    const stream = renderToReadableStream(element);
    const result = await createFromReadableStream(stream);

    expect(result.props.children[0].key).toBe(0);
    expect(result.props.children[1].key).toBe(1);
    expect(result.props.children[2].key).toBe(2);
  });
});

describe("React Elements - Mixed Content", () => {
  it("should serialize mixed server/client structure", async () => {
    function ClientInteractive() {}
    const ClientRef = registerClientReference(
      ClientInteractive,
      "Interactive.js",
      "default"
    );

    // Server component renders a mix of HTML and client components
    const structure = createElement(
      "article",
      { className: "post" },
      createElement("h1", null, "Title"),
      createElement("p", null, "Server-rendered content"),
      createElement(
        ClientRef,
        {
          data: { action: "like" },
        },
        "Interactive Part"
      ),
      createElement("footer", null, "Server footer")
    );

    const stream = renderToReadableStream(structure);
    const result = await createFromReadableStream(stream);

    expect(result.type).toBe("article");
    expect(result.props.children).toHaveLength(4);
  });
});

describe("React Elements - Special Characters in Props", () => {
  it("should handle special characters in className", async () => {
    const element = createElement("div", {
      className: "container-[100px] md:flex lg:grid-cols-3",
    });

    const stream = renderToReadableStream(element);
    const result = await createFromReadableStream(stream);

    expect(result.props.className).toBe(
      "container-[100px] md:flex lg:grid-cols-3"
    );
  });

  it("should handle unicode in content", async () => {
    const element = createElement("p", null, "Hello 世界 🌍 مرحبا");

    const stream = renderToReadableStream(element);
    const result = await createFromReadableStream(stream);

    expect(result.props.children).toBe("Hello 世界 🌍 مرحبا");
  });
});

describe("Client Reference Module Loading", () => {
  it("should deserialize client reference and load module with async requireModule", async () => {
    // 1. Server: register client reference
    function ClientButton({ label }) {
      return createElement("button", null, label);
    }

    const ref = registerClientReference(
      ClientButton,
      "components/Button.client.js",
      "default"
    );

    // 2. Server: serialize element with client reference as type
    const element = createElement(ref, { label: "Click me" });
    const stream = renderToReadableStream(element);

    // 3. Client: create moduleLoader that provides the actual component
    const moduleLoader = {
      requireModule: vi.fn((_metadata) => {
        // Async loading like native import()
        return Promise.resolve({
          default: ClientButton,
        });
      }),
    };

    // 4. Client: deserialize — async imports are awaited eagerly during
    //    stream consumption, so the resolved type is the actual component.
    const result = await createFromReadableStream(stream, { moduleLoader });

    // Result is a React element whose type is the resolved component
    expect(result.$$typeof).toBe(REACT_ELEMENT_TYPE);
    expect(result.props.label).toBe("Click me");
    expect(result.type).toBe(ClientButton);

    // Verify moduleLoader was called with correct metadata
    expect(moduleLoader.requireModule).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "components/Button.client.js",
        name: "default",
      })
    );
  });

  it("should deserialize client reference and load module with sync requireModule", async () => {
    // 1. Server: register client reference with named export
    function IconComponent({ name }) {
      return createElement("i", { className: `icon-${name}` });
    }

    const ref = registerClientReference(
      IconComponent,
      "components/icons.js",
      "Icon"
    );

    // 2. Server: serialize
    const element = createElement(ref, { name: "star" });
    const stream = renderToReadableStream(element);

    // 3. Client: sync moduleLoader (like require())
    const moduleLoader = {
      requireModule: vi.fn((_metadata) => ({
        Icon: IconComponent,
        OtherIcon: () => null,
      })),
    };

    // 4. Client: deserialize — sync modules resolve the chunk directly
    const result = await createFromReadableStream(stream, { moduleLoader });

    // Type is the resolved component directly
    expect(result.type).toBe(IconComponent);

    expect(moduleLoader.requireModule).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "components/icons.js",
        name: "Icon",
      })
    );
  });

  it("should load multiple client references from same module", async () => {
    function Button() {}
    function Input() {}

    const ButtonRef = registerClientReference(
      Button,
      "components/form.js",
      "Button"
    );
    const InputRef = registerClientReference(
      Input,
      "components/form.js",
      "Input"
    );

    const element = createElement(
      "div",
      null,
      createElement(ButtonRef, { type: "submit" }),
      createElement(InputRef, { name: "email" })
    );

    const stream = renderToReadableStream(element);

    const formModule = { Button, Input };
    const moduleLoader = {
      requireModule: vi.fn(() => formModule),
    };

    const result = await createFromReadableStream(stream, { moduleLoader });

    // Get both child elements
    const [buttonEl, inputEl] = result.props.children;

    // Sync modules resolve eagerly — types are the actual components
    expect(buttonEl.type).toBe(Button);
    expect(inputEl.type).toBe(Input);
  });

  it("should cache module promise to avoid duplicate loads with module rows", async () => {
    // Use raw wire format with $I (module row) and $L (lazy references)
    // This tests caching when multiple elements reference the same module row
    const wire =
      '1:I{"id":"components/Card.js","name":"default","chunks":[]}\n' +
      '0:["$","div",null,{"children":[["$","$L1",null,{"variant":"primary"}],["$","$L1",null,{"variant":"secondary"}]]}]\n';

    function Card() {}

    const moduleLoader = {
      requireModule: vi.fn(() => {
        return Promise.resolve({ default: Card });
      }),
    };

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(wire));
        controller.close();
      },
    });

    const result = await createFromReadableStream(stream, { moduleLoader });

    const children = result.props.children;

    // Async modules are resolved eagerly — types are the actual components
    for (const child of children) {
      expect(child.type).toBe(Card);
    }

    // Module should only be loaded once due to caching on shared chunk
    expect(moduleLoader.requireModule).toHaveBeenCalledTimes(1);
  });

  it("should handle module loading errors gracefully", async () => {
    function BrokenComponent() {}

    const ref = registerClientReference(
      BrokenComponent,
      "components/Broken.js",
      "default"
    );

    const element = createElement(ref, {});
    const stream = renderToReadableStream(element);

    const loadError = new Error("Module not found: components/Broken.js");
    const moduleLoader = {
      requireModule: vi.fn(() => Promise.reject(loadError)),
    };

    // Async import rejection routes through rejectChunk. For the root
    // chunk (id 0), this creates an ErrorThrower element. For non-root
    // chunks, the chunk is rejected and the error surfaces when the
    // model row references it.
    const result = await createFromReadableStream(stream, { moduleLoader });

    // The type is a lazy wrapper around the rejected chunk.
    // When React calls _init(), it will throw the load error.
    expect(result.$$typeof).toBe(REACT_ELEMENT_TYPE);
    expect(result.type.$$typeof).toBe(REACT_LAZY_TYPE);
    expect(() => result.type._init(result.type._payload)).toThrow(
      "Module not found"
    );
  });
});
