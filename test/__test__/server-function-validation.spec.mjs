import { hostname, page, server, waitForHydration } from "playground/utils";
import { expect, test } from "vitest";

/**
 * Runtime-level E2E for `createFunction` slot-walk validation.
 *
 * What this asserts (and why each case matters):
 *
 *   - Happy path: declared schemas accept correct inputs and the
 *     handler runs (proves the slot-walk path doesn't break the common
 *     case).
 *   - parse → validate ordering: `parse.args[0]` runs before
 *     `validate.args[0]`, so a wire string can be coerced into a number
 *     before the schema runs.
 *   - Validation rejects → handler does NOT run: this is the load-bearing
 *     security contract. The fixture's `tooShort` action sets a server-
 *     side global if the handler ever executes; after the rejected call
 *     we observe that global is still null (no handler invocation).
 *   - formData wire-aware constraints: oversize / bad MIME /
 *     unknown-key injection are all rejected at decode time, not
 *     downstream, so the client receives an error and the upload
 *     handler is never reached.
 *   - Bare `"use server"` (no `createFunction` wrapper) keeps working
 *     unchanged — back-compat is preserved.
 *
 * The fixture stashes either the success descriptor or
 * `{ kind: "clientError", message }` on `window.__react_server_result__`
 * so the assertions read a consistent shape regardless of path.
 */

const result = () =>
  page.evaluate(() => window.__react_server_result__ ?? null);

async function clickAndAwaitResult(testid) {
  await page.evaluate(() => {
    window.__react_server_result__ = undefined;
  });
  await page.getByTestId(testid).click();
  // Poll for result; @lazarv/react-server resolves promises through
  // RSC, so we wait until the global is set.
  await page.waitForFunction(
    () => window.__react_server_result__ !== undefined,
    null,
    { timeout: 5_000 }
  );
  return result();
}

test("createFunction slot-walk validation — happy path", async () => {
  await server("fixtures/server-function-validation.jsx");
  await page.goto(hostname);
  await waitForHydration();

  const r = await clickAndAwaitResult("v-greet-ok");
  expect(r).toMatchObject({
    kind: "ok",
    name: "alice",
    age: 30,
    handlerRan: true,
  });
});

test("createFunction rejects bad slot-0 type before handler runs", async () => {
  await server("fixtures/server-function-validation.jsx");
  await page.goto(hostname);
  await waitForHydration();

  const r = await clickAndAwaitResult("v-greet-bad-arg-0");
  expect(r?.kind).toBe("clientError");
});

test("createFunction rejects bad slot-1 type", async () => {
  await server("fixtures/server-function-validation.jsx");
  await page.goto(hostname);
  await waitForHydration();

  const r = await clickAndAwaitResult("v-greet-bad-arg-1");
  expect(r?.kind).toBe("clientError");
});

test("parse.args runs before validate.args (string → number coercion)", async () => {
  await server("fixtures/server-function-validation.jsx");
  await page.goto(hostname);
  await waitForHydration();

  const r = await clickAndAwaitResult("v-parsed-number-ok");
  expect(r).toMatchObject({ kind: "ok", n: 42, handlerRan: true });
});

test("parse.args producing NaN fails validate.args", async () => {
  await server("fixtures/server-function-validation.jsx");
  await page.goto(hostname);
  await waitForHydration();

  const r = await clickAndAwaitResult("v-parsed-number-bad");
  expect(r?.kind).toBe("clientError");
});

test("validation failure: handler must not run (no server-side side effect)", async () => {
  await server("fixtures/server-function-validation.jsx");
  await page.goto(hostname);
  await waitForHydration();

  // Reset shared marker.
  await clickAndAwaitResult("v-reset-side-effect");

  // Trigger a validation failure on `tooShort`.
  const err = await clickAndAwaitResult("v-too-short");
  expect(err?.kind).toBe("clientError");

  // Read the marker — if the handler ran (bug), it would be "hi".
  const marker = await clickAndAwaitResult("v-too-short-side-effect");
  expect(marker).toBe(null);
});

test("formData upload — happy path", async () => {
  await server("fixtures/server-function-validation.jsx");
  await page.goto(hostname);
  await waitForHydration();

  const r = await clickAndAwaitResult("v-upload-ok");
  expect(r).toMatchObject({
    kind: "ok",
    title: "hello",
    photoSize: 16,
    photoType: "image/png",
    handlerRan: true,
  });
});

test("formData upload — oversize file rejected", async () => {
  await server("fixtures/server-function-validation.jsx");
  await page.goto(hostname);
  await waitForHydration();

  const r = await clickAndAwaitResult("v-upload-oversize");
  expect(r?.kind).toBe("clientError");
});

test("formData upload — wrong MIME rejected", async () => {
  await server("fixtures/server-function-validation.jsx");
  await page.goto(hostname);
  await waitForHydration();

  const r = await clickAndAwaitResult("v-upload-bad-mime");
  expect(r?.kind).toBe("clientError");
});

test("formData upload — injected unknown key rejected", async () => {
  await server("fixtures/server-function-validation.jsx");
  await page.goto(hostname);
  await waitForHydration();

  const r = await clickAndAwaitResult("v-upload-injected");
  expect(r?.kind).toBe("clientError");
});

test("bare 'use server' export without createFunction works unchanged", async () => {
  await server("fixtures/server-function-validation.jsx");
  await page.goto(hostname);
  await waitForHydration();

  const r = await clickAndAwaitResult("v-bare-echo");
  expect(r).toMatchObject({
    kind: "ok",
    value: { shape: "anything" },
    handlerRan: true,
  });
});

// ─── Wire-aware Flight-protocol helpers ─────────────────────────────────
//
// Each pair below covers one helper end-to-end through the dev runtime:
// the happy path proves the wire round-trip + handler sees the right
// platform type, and the rejection path proves the slot-walk aborts
// before the handler can run (or, for streams/iterables, that the
// handler observes a `drainError` set by the wrapped consumer).

test("arrayBuffer — happy path", async () => {
  await server("fixtures/server-function-validation.jsx");
  await page.goto(hostname);
  await waitForHydration();
  const r = await clickAndAwaitResult("v-ab-ok");
  expect(r).toMatchObject({
    kind: "ok",
    isArrayBuffer: true,
    byteLength: 4,
    first: 1,
    handlerRan: true,
  });
});

test("arrayBuffer — oversize rejected", async () => {
  await server("fixtures/server-function-validation.jsx");
  await page.goto(hostname);
  await waitForHydration();
  const r = await clickAndAwaitResult("v-ab-oversize");
  expect(r?.kind).toBe("clientError");
});

test("typedArray — happy path with declared ctor", async () => {
  await server("fixtures/server-function-validation.jsx");
  await page.goto(hostname);
  await waitForHydration();
  const r = await clickAndAwaitResult("v-ta-ok");
  expect(r).toMatchObject({
    kind: "ok",
    ctor: "Uint8Array",
    byteLength: 4,
    first: 5,
    handlerRan: true,
  });
});

test("typedArray — wrong ctor rejected", async () => {
  await server("fixtures/server-function-validation.jsx");
  await page.goto(hostname);
  await waitForHydration();
  const r = await clickAndAwaitResult("v-ta-bad-ctor");
  expect(r?.kind).toBe("clientError");
});

test("typedArray — oversize rejected", async () => {
  await server("fixtures/server-function-validation.jsx");
  await page.goto(hostname);
  await waitForHydration();
  const r = await clickAndAwaitResult("v-ta-oversize");
  expect(r?.kind).toBe("clientError");
});

test("map — happy path with inner key/value schemas", async () => {
  await server("fixtures/server-function-validation.jsx");
  await page.goto(hostname);
  await waitForHydration();
  const r = await clickAndAwaitResult("v-map-ok");
  expect(r).toMatchObject({
    kind: "ok",
    isMap: true,
    size: 2,
    handlerRan: true,
  });
});

test("map — oversize rejected", async () => {
  await server("fixtures/server-function-validation.jsx");
  await page.goto(hostname);
  await waitForHydration();
  const r = await clickAndAwaitResult("v-map-oversize");
  expect(r?.kind).toBe("clientError");
});

test("map — bad inner value rejected", async () => {
  await server("fixtures/server-function-validation.jsx");
  await page.goto(hostname);
  await waitForHydration();
  const r = await clickAndAwaitResult("v-map-bad-value");
  expect(r?.kind).toBe("clientError");
});

test("set — happy path", async () => {
  await server("fixtures/server-function-validation.jsx");
  await page.goto(hostname);
  await waitForHydration();
  const r = await clickAndAwaitResult("v-set-ok");
  expect(r).toMatchObject({
    kind: "ok",
    isSet: true,
    size: 2,
    handlerRan: true,
  });
});

test("set — oversize rejected", async () => {
  await server("fixtures/server-function-validation.jsx");
  await page.goto(hostname);
  await waitForHydration();
  const r = await clickAndAwaitResult("v-set-oversize");
  expect(r?.kind).toBe("clientError");
});

test("stream — drains within cap", async () => {
  await server("fixtures/server-function-validation.jsx");
  await page.goto(hostname);
  await waitForHydration();
  const r = await clickAndAwaitResult("v-stream-under-cap");
  expect(r).toMatchObject({
    kind: "ok",
    chunkCount: 2,
    drainError: null,
    handlerRan: true,
  });
});

test("stream — wrapped consumer errors past maxChunks", async () => {
  await server("fixtures/server-function-validation.jsx");
  await page.goto(hostname);
  await waitForHydration();
  const r = await clickAndAwaitResult("v-stream-over-cap");
  // The handler runs (validation gates only the slot's wire shape, not
  // chunk contents), but its `drainError` must be set when the wrapper
  // reaches the cap. That's the contract: bounds enforced as the
  // handler consumes, not at decode.
  expect(r?.kind).toBe("ok");
  expect(r?.handlerRan).toBe(true);
  expect(r?.drainError).toMatch(/max_chunks_exceeded/);
});

test("asyncIterable — yields within cap and inner schema", async () => {
  await server("fixtures/server-function-validation.jsx");
  await page.goto(hostname);
  await waitForHydration();
  const r = await clickAndAwaitResult("v-aiter-ok");
  expect(r).toMatchObject({
    kind: "ok",
    yields: [1, 2],
    drainError: null,
  });
});

test("asyncIterable — over-yield surfaces as drainError", async () => {
  await server("fixtures/server-function-validation.jsx");
  await page.goto(hostname);
  await waitForHydration();
  const r = await clickAndAwaitResult("v-aiter-overyield");
  expect(r?.kind).toBe("ok");
  expect(r?.drainError).toMatch(/max_yields_exceeded/);
});

test("asyncIterable — bad-value yield surfaces as drainError", async () => {
  await server("fixtures/server-function-validation.jsx");
  await page.goto(hostname);
  await waitForHydration();
  const r = await clickAndAwaitResult("v-aiter-bad-value");
  expect(r?.kind).toBe("ok");
  expect(r?.drainError).toMatch(/validate_failed/);
});

test("iterable — sync iteration with caps", async () => {
  await server("fixtures/server-function-validation.jsx");
  await page.goto(hostname);
  await waitForHydration();
  const r = await clickAndAwaitResult("v-iter-ok");
  expect(r).toMatchObject({
    kind: "ok",
    yields: [1, 2],
    drainError: null,
  });
});

test("iterable — over-yield surfaces as drainError", async () => {
  await server("fixtures/server-function-validation.jsx");
  await page.goto(hostname);
  await waitForHydration();
  const r = await clickAndAwaitResult("v-iter-overyield");
  expect(r?.kind).toBe("ok");
  expect(r?.drainError).toMatch(/max_yields_exceeded/);
});

test("promise — resolves through inner schema", async () => {
  await server("fixtures/server-function-validation.jsx");
  await page.goto(hostname);
  await waitForHydration();
  const r = await clickAndAwaitResult("v-promise-ok");
  expect(r).toMatchObject({
    kind: "ok",
    value: "hello",
    awaitError: null,
  });
});

test("promise — bad resolved value surfaces as awaitError", async () => {
  await server("fixtures/server-function-validation.jsx");
  await page.goto(hostname);
  await waitForHydration();
  const r = await clickAndAwaitResult("v-promise-bad-value");
  expect(r?.kind).toBe("ok");
  expect(r?.awaitError).toMatch(/validate_failed/);
});
