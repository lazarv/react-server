import { hostname, page, server, waitForHydration } from "playground/utils";
import { createHash } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";

/**
 * End-to-end content-fidelity tests for file uploads.
 *
 * The existing server-function-validation suite covers the *shape*
 * of file uploads (slot-walk validation, MIME / size rejection),
 * but only checks `size` / `type` metadata — never the bytes. This
 * spec proves that file *contents* survive intact through the whole
 * stack:
 *
 *   browser FormData → multipart wire → middleware →
 *   request.formData() → createFunction slot-walk → handler
 *
 * The fixture's client buttons construct each File from a
 * deterministic xorshift sequence (`generateBytes(seed, len)`).  This
 * spec mirrors that function so it can compute the expected SHA-256
 * digest from the same byte source the browser sent.  The server
 * function returns the digest it computed over the received bytes,
 * and we assert equality.
 *
 * Two passes:
 *
 *   1. Plain runtime path: no `server.multipart.*` config, body is
 *      consumed via `Request.formData()` (undici's parser).
 *   2. Multipart-cap path: `server.multipart.*` configured to a
 *      generous ceiling so busboy parses, FormData is rebuilt, and
 *      the renderer reads from the rebuilt body.  Same fidelity
 *      assertions — verifies that swapping parsers preserves bytes.
 */

// Mirror of fixtures/file-upload-client.jsx::generateBytes. Keep in
// sync with that function — both must produce the same sequence for
// a given (seed, len).
function generateBytes(seed, len) {
  const out = new Uint8Array(len);
  let s = seed | 0 || 1;
  for (let i = 0; i < len; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    out[i] = s & 0xff;
  }
  return out;
}

function expectedSha256(seed, len) {
  return createHash("sha256").update(generateBytes(seed, len)).digest("hex");
}

const SHA256_EMPTY =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const result = () =>
  page.evaluate(() => window.__react_server_result__ ?? null);

async function clickAndAwaitResult(testid) {
  await page.evaluate(() => {
    window.__react_server_result__ = undefined;
  });
  await page.getByTestId(testid).click();
  await page.waitForFunction(
    () => window.__react_server_result__ !== undefined,
    null,
    { timeout: 10_000 }
  );
  return result();
}

describe("file-upload — platform parser path", () => {
  beforeAll(async () => {
    await server("fixtures/file-upload.jsx");
  });

  beforeEach(async () => {
    await page.goto(hostname);
    await waitForHydration();
  });

  test("validated single file: small payload bytes survive", async () => {
    const r = await clickAndAwaitResult("u-validated-small");
    expect(r).toMatchObject({
      kind: "ok",
      name: "small.bin",
      type: "application/octet-stream",
      size: 16,
      sha256: expectedSha256(101, 16),
    });
  });

  test("validated single file: 64 KiB payload bytes survive (chunked encoding)", async () => {
    const r = await clickAndAwaitResult("u-validated-large");
    expect(r).toMatchObject({
      kind: "ok",
      name: "big.bin",
      size: 64 * 1024,
      sha256: expectedSha256(202, 64 * 1024),
    });
  });

  test("validated single file: empty payload (0 bytes)", async () => {
    const r = await clickAndAwaitResult("u-validated-empty");
    expect(r).toMatchObject({
      kind: "ok",
      name: "empty.bin",
      size: 0,
      sha256: SHA256_EMPTY,
    });
  });

  test("validated single file: UTF-8 filename + custom MIME round-trip", async () => {
    const r = await clickAndAwaitResult("u-validated-utf8-name");
    expect(r).toMatchObject({
      kind: "ok",
      name: "ファイル-π.dat",
      type: "application/x-react-server-test",
      size: 32,
      sha256: expectedSha256(303, 32),
    });
  });

  test("bare 'use server' upload: multiple files + text field, all survive", async () => {
    const r = await clickAndAwaitResult("u-bare-multi");
    expect(r?.kind).toBe("ok");
    expect(r.entries).toHaveLength(3);

    const caption = r.entries.find((e) => e.kind === "field");
    expect(caption).toMatchObject({
      name: "caption",
      kind: "field",
      value: "hello world",
    });

    const files = r.entries.filter((e) => e.kind === "file");
    expect(files).toHaveLength(2);
    expect(files[0]).toMatchObject({
      name: "files",
      filename: "f1.bin",
      size: 24,
      sha256: expectedSha256(404, 24),
    });
    expect(files[1]).toMatchObject({
      name: "files",
      filename: "f2.bin",
      size: 48,
      sha256: expectedSha256(505, 48),
    });
  });

  test("validated mixed: two files + text, each surfaces with its own bytes", async () => {
    const r = await clickAndAwaitResult("u-mixed");
    expect(r).toMatchObject({
      kind: "ok",
      caption: "two files plus text",
      a: {
        name: "a.bin",
        size: 100,
        sha256: expectedSha256(606, 100),
      },
      b: {
        name: "b.bin",
        size: 200,
        sha256: expectedSha256(707, 200),
      },
    });
  });
});

describe("file-upload — multipart-cap (busboy) path", () => {
  beforeAll(async () => {
    await server("fixtures/file-upload.jsx", {
      initialConfig: {
        server: {
          multipart: {
            // Ceilings well above any test payload — we're verifying
            // bytes-survival through the busboy parser, not cap
            // enforcement (that's covered by http-multipart-cap.spec).
            maxFileSize: 1 * 1024 * 1024,
            maxFieldSize: 64 * 1024,
            maxFiles: 10,
            maxFields: 100,
            maxParts: 50,
            maxFieldNameSize: 200,
          },
        },
      },
    });
  });

  beforeEach(async () => {
    await page.goto(hostname);
    await waitForHydration();
  });

  test("64 KiB file digest matches through busboy parse", async () => {
    const r = await clickAndAwaitResult("u-validated-large");
    expect(r).toMatchObject({
      kind: "ok",
      name: "big.bin",
      size: 64 * 1024,
      sha256: expectedSha256(202, 64 * 1024),
    });
  });

  test("UTF-8 filename + custom MIME survive busboy parse", async () => {
    const r = await clickAndAwaitResult("u-validated-utf8-name");
    expect(r).toMatchObject({
      kind: "ok",
      name: "ファイル-π.dat",
      type: "application/x-react-server-test",
      size: 32,
      sha256: expectedSha256(303, 32),
    });
  });

  test("multi-file mixed bare upload through busboy", async () => {
    const r = await clickAndAwaitResult("u-bare-multi");
    expect(r?.kind).toBe("ok");
    const files = r.entries.filter((e) => e.kind === "file");
    expect(files[0].sha256).toBe(expectedSha256(404, 24));
    expect(files[1].sha256).toBe(expectedSha256(505, 48));
  });

  test("validated mixed: two files + text through busboy", async () => {
    const r = await clickAndAwaitResult("u-mixed");
    expect(r).toMatchObject({
      kind: "ok",
      caption: "two files plus text",
      a: { sha256: expectedSha256(606, 100) },
      b: { sha256: expectedSha256(707, 200) },
    });
  });
});
