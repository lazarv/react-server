import {
  hostname,
  logs,
  page,
  server,
  waitForChange,
  waitForHydration,
} from "playground/utils";
import { expect, test } from "vitest";

// ---------------------------------------------------------------------------
// "use client" inline
// ---------------------------------------------------------------------------

test("use client inline", async () => {
  await server("fixtures/use-client-inline.jsx");
  await page.goto(hostname);
  await waitForHydration();

  expect(await page.textContent("h1")).toBe(
    '"use client" inline temp server scope'
  );

  // Counter (top-level FunctionDeclaration)
  const buttons = await page.getByRole("button").all();
  expect(buttons.length).toBe(2);

  expect(await page.locator("p").nth(0).textContent()).toContain("Count: 0");
  await waitForChange(
    () => buttons[0].click(),
    () => page.locator("p").nth(0).textContent()
  );
  expect(await page.locator("p").nth(0).textContent()).toContain("Count: 1");

  // Counter2 (nested arrow function)
  expect(await page.locator("p").nth(1).textContent()).toContain("Count2: 0");
  await waitForChange(
    () => buttons[1].click(),
    () => page.locator("p").nth(1).textContent()
  );
  expect(await page.locator("p").nth(1).textContent()).toContain("Count2: 1");
});

test("use client inline with props", async () => {
  await server("fixtures/use-client-inline-props.jsx");
  await page.goto(hostname);
  await waitForHydration();

  // Badge — top-level client component with explicit prop, captures "shared"
  expect(await page.getByTestId("badge").textContent()).toBe("shared tag");

  // Input — top-level client component with onChange prop
  const input = page.getByTestId("input");
  expect(await input.getAttribute("placeholder")).toBe("type here");
  await input.fill("test");
  expect(await input.inputValue()).toBe("test");

  // Greeting — nested client component with destructured prop, captures "greeting"
  expect(await page.getByTestId("greeting").textContent()).toBe("hello world");

  // Display — nested client component with rest props, captures "greeting"
  const display = page.getByTestId("display");
  expect(await display.textContent()).toBe("hello content");
  expect(await display.getAttribute("title")).toBe("box");
});

// ---------------------------------------------------------------------------
// "use server" inline in "use client" inline
// ---------------------------------------------------------------------------

test("use server inline in use client inline", async () => {
  await server("fixtures/use-server-in-client.jsx");
  await page.goto(hostname);
  await waitForHydration();

  expect(await page.getByTestId("count").textContent()).toBe("Count: 0");

  // Increment (FunctionDeclaration server action)
  await page.getByTestId("increment").click();
  await waitForChange(null, () => page.getByTestId("count").textContent());
  expect(await page.getByTestId("count").textContent()).toBe("Count: 1");

  // Decrement (arrow function server action)
  await page.getByTestId("decrement").click();
  await waitForChange(
    null,
    () => page.getByTestId("count").textContent(),
    "Count: 1"
  );
  expect(await page.getByTestId("count").textContent()).toBe("Count: 0");
});

// ---------------------------------------------------------------------------
// "use server" inline with captured variables
// ---------------------------------------------------------------------------

test("use server inline with captured variables", async () => {
  await server("fixtures/use-server-inline-captured.jsx");
  await page.goto(hostname);
  await waitForHydration();

  // multiply — top-level server action capturing module-scope `multiplier` and `label`
  await page.getByTestId("multiply-btn").click();
  await expect
    .poll(
      () =>
        page
          .getByTestId("multiply-result")
          .textContent()
          .catch(() => null),
      { timeout: 30000 }
    )
    .toBe('{"result":21}');

  // add — nested FunctionDeclaration capturing `offset` from component scope
  await page.getByTestId("add-btn").click();
  await expect
    .poll(
      () =>
        page
          .getByTestId("add-result")
          .textContent()
          .catch(() => null),
      { timeout: 30000 }
    )
    .toBe('{"result":15}');

  // subtract — nested arrow capturing `offset` from component scope
  await page.getByTestId("subtract-btn").click();
  await expect
    .poll(
      () =>
        page
          .getByTestId("subtract-result")
          .textContent()
          .catch(() => null),
      { timeout: 30000 }
    )
    .toBe('{"result":15}');
});

// ---------------------------------------------------------------------------
// Multiple "use server" inline functions called from "use client" inline
// ---------------------------------------------------------------------------

test("use server inline multiple functions in client", async () => {
  await server("fixtures/use-server-inline-multi.jsx");
  await page.goto(hostname);
  await waitForHydration();

  // Add three items via server action
  for (let i = 0; i < 3; i++) {
    await page.getByTestId("add-btn").click();
    const expected = Array.from({ length: i + 1 }, (_, j) => `item-${j}`).join(
      ""
    );
    await expect
      .poll(() => page.getByTestId("items").textContent(), { timeout: 30000 })
      .toBe(expected);
  }

  const items = await page.getByTestId("items").textContent();
  expect(items).toContain("item-0");
  expect(items).toContain("item-1");
  expect(items).toContain("item-2");

  // Format items via a second server action
  await page.getByTestId("format-btn").click();
  await expect
    .poll(
      () =>
        page
          .getByTestId("formatted")
          .textContent()
          .catch(() => null),
      { timeout: 30000 }
    )
    .toBe("[item] item-0, [item] item-1, [item] item-2");
});

// ---------------------------------------------------------------------------
// Mixed "use client" and "use server" inline in one server module
// ---------------------------------------------------------------------------

test("mixed use client and use server inline", async () => {
  await server("fixtures/use-mixed-inline.jsx");
  await page.goto(hostname);
  await waitForHydration();

  // ClientGreeter: top-level "use client" calls top-level "use server" fetchGreeting
  await page.getByTestId("greet-btn").click();
  await expect
    .poll(
      () =>
        page
          .getByTestId("greeting")
          .textContent()
          .catch(() => null),
      { timeout: 30000 }
    )
    .toBe("from server: Hello, world!");

  // Calculator: nested "use client" calls nested "use server" double
  await page.getByTestId("calc-btn").click();
  await expect
    .poll(
      () =>
        page
          .getByTestId("calc-result")
          .textContent()
          .catch(() => null),
      { timeout: 30000 }
    )
    .toBe("42");
});

// ---------------------------------------------------------------------------
// Nested inline directives: "use client" containing "use server",
// at both top-level and component-scope
// ---------------------------------------------------------------------------

test("nested inline use directives", async () => {
  await server("fixtures/use-nested-inline.jsx");
  await page.goto(hostname);
  await waitForHydration();

  // ConfigPanel (top-level "use client") calls fetchConfig (top-level "use server")
  await page.getByTestId("load-btn").click();
  await expect
    .poll(
      () =>
        page
          .getByTestId("config")
          .textContent()
          .catch(() => null),
      { timeout: 30000 }
    )
    .toBe("nested-app/dark");

  // ConfigPanel then calls its own nested saveConfig ("use server" inside "use client")
  await page.getByTestId("save-btn").click();
  await expect
    .poll(
      () =>
        page
          .getByTestId("saved")
          .textContent()
          .catch(() => null),
      { timeout: 30000 }
    )
    .toBe("saved:nested-app:dark");

  // MathPanel (component-scope "use client") calls multiply (component-scope "use server")
  await page.getByTestId("multiply-btn").click();
  await expect
    .poll(
      () =>
        page
          .getByTestId("product")
          .textContent()
          .catch(() => null),
      { timeout: 30000 }
    )
    .toBe("70");

  // MathPanel then calls its own nested formatResult ("use server" inside "use client")
  await page.getByTestId("format-btn").click();
  await expect
    .poll(
      () =>
        page
          .getByTestId("formatted-result")
          .textContent()
          .catch(() => null),
      { timeout: 30000 }
    )
    .toBe("result=70");
});

// ---------------------------------------------------------------------------
// "use client" inside "use server" — server action returns rendered client component
// ---------------------------------------------------------------------------

test("use client inline inside use server inline", async () => {
  await server("fixtures/use-client-in-server-inline.jsx");
  await page.goto(hostname);
  await waitForHydration();

  // Top-level: getGreeting ("use server") defines GreetingCard ("use client") and returns it
  await page.getByTestId("load-greeting").click();
  await expect
    .poll(
      () =>
        page
          .getByTestId("greeting-message")
          .textContent()
          .catch(() => null),
      { timeout: 30000 }
    )
    .toBe("Hello, World!");

  // The returned client component is interactive (useState works)
  await page.getByTestId("like-btn").click();
  await expect
    .poll(
      () =>
        page
          .getByTestId("liked-status")
          .textContent()
          .catch(() => null),
      { timeout: 30000 }
    )
    .toBe("liked");

  // Component-scope: calculate ("use server", captures multiplier) defines ResultCard ("use client")
  await page.getByTestId("calc-btn").click();
  await expect
    .poll(
      () =>
        page
          .getByTestId("calc-value")
          .textContent()
          .catch(() => null),
      { timeout: 30000 }
    )
    .toBe("35");

  // The returned client component is interactive
  await page.getByTestId("highlight-btn").click();
  await expect
    .poll(
      () =>
        page
          .getByTestId("highlighted-status")
          .textContent()
          .catch(() => null),
      { timeout: 30000 }
    )
    .toBe("highlighted");
});

// ---------------------------------------------------------------------------
// Inline "use server" in a top-level "use client" file
// ---------------------------------------------------------------------------

test("use server inline in top-level use client file", async () => {
  await server("fixtures/use-server-in-client-file-app.jsx");
  await page.goto(hostname);
  await waitForHydration();

  // Add two items via inline server action defined in a "use client" file
  for (let i = 0; i < 2; i++) {
    await page.getByTestId("add-btn").click();
    const expected = Array.from({ length: i + 1 }, (_, j) => `item-${j}`).join(
      ""
    );
    await expect
      .poll(() => page.getByTestId("items").textContent(), { timeout: 30000 })
      .toBe(expected);
  }

  // Format first item via a second inline server action
  await page.getByTestId("format-btn").click();
  await waitForChange(
    null,
    () => page.getByTestId("items").textContent(),
    "item-0item-1"
  );
  const items = await page.getByTestId("items").textContent();
  expect(items).toContain("[");
  expect(items).toContain("] item-0");
});

// ---------------------------------------------------------------------------
// Inline "use client" in a top-level "use server" file
// ---------------------------------------------------------------------------

test("use client inline in top-level use server file", async () => {
  await server("fixtures/use-client-in-server-file-app.jsx");
  await page.goto(hostname);
  await waitForHydration();

  // createBadge — server function returns an inline "use client" component
  await page.getByTestId("load-badge").click();
  await expect
    .poll(
      () =>
        page
          .getByTestId("badge")
          .textContent()
          .catch(() => null),
      { timeout: 30000 }
    )
    .toBe("[server] hello");

  // The returned client component is interactive (click toggles text)
  await page.getByTestId("badge").click();
  await expect
    .poll(() => page.getByTestId("badge").textContent(), { timeout: 30000 })
    .toBe("clicked:[server] hello");

  // createToggle — second server function returns a different inline "use client" component
  await page.getByTestId("load-toggle").click();
  await expect
    .poll(
      () =>
        page
          .getByTestId("toggle")
          .textContent()
          .catch(() => null),
      { timeout: 30000 }
    )
    .toBe("OFF: feature");

  // Toggle is interactive
  await page.getByTestId("toggle").click();
  await expect
    .poll(() => page.getByTestId("toggle").textContent(), { timeout: 30000 })
    .toBe("ON: feature");
});

// ---------------------------------------------------------------------------
// Inline server actions (form-based) — moved from basic.spec.mjs
// ---------------------------------------------------------------------------

for (const id of [
  "inline-jsx-prop",
  "inline-server-action-function",
  "inline-server-action-arrow",
  "inline-server-action-top-level",
]) {
  test(`${id} server action`, async () => {
    await server("fixtures/server-actions.jsx");
    await page.goto(hostname);

    const button = await page.getByTestId(id);

    await waitForChange(
      () => button.click(),
      () => logs.includes(`submitted ${id}!`)
    );
    expect(logs).toContain(`submitted ${id}!`);
  });
}
