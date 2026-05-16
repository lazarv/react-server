import { hostname, server } from "playground/utils";
import { describe, expect, test } from "vitest";

/**
 * Integration tests for the streaming multipart cap
 * (`server.multipart.*`). The cap lives in `lib/http/multipart-cap.mjs`
 * and is wired into both adapter targets: the Node `createMiddleware`
 * path consumes it directly with the raw `IncomingMessage`, and the
 * edge / serverless path adapts the Web Request body via
 * `Readable.fromWeb` in `adapters/shared/edge-body-caps.mjs`. Both
 * paths share the same busboy core so cap semantics stay symmetric.
 *
 * The cap defends against attacks that `server.maxBodyBytes`
 * cannot bound:
 *
 *   - **High-cardinality**: 1M small fields fit inside any
 *     reasonable body cap, but the platform parser still allocates
 *     1M FormData entries.  `maxFields` / `maxParts` cap that.
 *   - **Long field names**: a single field with a 1 MiB name has
 *     small wire bytes but allocates a 1 MiB string.
 *     `maxFieldNameSize` catches it.
 *   - **File-as-field smuggling**: a large blob without
 *     `filename=` bypasses any downstream `file()` size policy.
 *     `maxFieldSize` catches it.
 *
 * The fixture's `init$` reads the FormData and echoes the entries
 * as JSON, so we can verify both:
 *
 *   1. **A/B equivalence**: with caps configured, the FormData
 *      busboy produces matches what the platform parser would have
 *      produced (filename, type, size, hex-prefix of bytes — the
 *      properties react-server's consumers actually rely on).
 *   2. **Per-cap rejection**: requests breaching any limit return
 *      HTTP 413 before the handler runs (no echoed entries).
 */

const FIXTURE = "fixtures/multipart-cap.jsx";

/**
 * Build a minimal multipart/form-data body for a list of parts.
 * `value` is treated as the raw body bytes after CRLF; pass a
 * string for fields and either a string or Buffer for files.
 */
function buildMultipart(parts) {
  const boundary = "------rs-test-" + Math.random().toString(36).slice(2);
  const chunks = [];
  for (const p of parts) {
    let header = `--${boundary}\r\n`;
    if (p.filename != null) {
      header += `Content-Disposition: form-data; name="${p.name}"; filename="${p.filename}"\r\n`;
      header += `Content-Type: ${p.type ?? "application/octet-stream"}\r\n`;
    } else {
      header += `Content-Disposition: form-data; name="${p.name}"\r\n`;
    }
    header += "\r\n";
    chunks.push(Buffer.from(header, "utf8"));
    chunks.push(
      Buffer.isBuffer(p.value) ? p.value : Buffer.from(p.value, "utf8")
    );
    chunks.push(Buffer.from("\r\n", "utf8"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function postMultipart(parts) {
  const { body, contentType } = buildMultipart(parts);
  return fetch(hostname, {
    method: "POST",
    body,
    headers: { "content-type": contentType },
  });
}

describe("server.multipart — A/B equivalence with platform parser", () => {
  test("busboy-parsed FormData matches platform-parsed shape", async () => {
    // First pass: NO multipart caps configured. The fixture's
    // init$ reads FormData via the platform parser.
    await server(FIXTURE);
    let platformOutput;
    {
      const res = await postMultipart([
        { name: "alpha", value: "first-value" },
        { name: "beta", value: "second-value" },
        {
          name: "upload",
          filename: "doc.txt",
          type: "text/plain",
          value: "hello world",
        },
        {
          name: "binary",
          filename: "blob.bin",
          type: "application/octet-stream",
          value: Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0x01, 0x02, 0x03]),
        },
      ]);
      expect(res.status).toBe(200);
      platformOutput = await res.json();
    }

    // Second pass: multipart caps configured (high enough to not
    // trip), so init$ reads FormData via busboy.
    await server(FIXTURE, {
      initialConfig: {
        server: {
          multipart: {
            maxFileSize: 10 * 1024,
            maxFieldSize: 10 * 1024,
            maxFiles: 10,
            maxFields: 10,
            maxParts: 20,
            maxFieldNameSize: 100,
          },
        },
      },
    });
    let busboyOutput;
    {
      const res = await postMultipart([
        { name: "alpha", value: "first-value" },
        { name: "beta", value: "second-value" },
        {
          name: "upload",
          filename: "doc.txt",
          type: "text/plain",
          value: "hello world",
        },
        {
          name: "binary",
          filename: "blob.bin",
          type: "application/octet-stream",
          value: Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0x01, 0x02, 0x03]),
        },
      ]);
      expect(res.status).toBe(200);
      busboyOutput = await res.json();
    }

    // Compare entry-by-entry on the properties react-server's
    // consumers actually rely on: name, kind, value/filename/type/
    // size, and the hex-prefix of file contents.
    expect(busboyOutput).toEqual(platformOutput);
  });
});

describe("server.multipart — per-cap rejections", () => {
  test("maxFileSize: oversize file part → 413", async () => {
    await server(FIXTURE, {
      initialConfig: {
        server: { multipart: { maxFileSize: 8 } },
      },
    });
    const res = await postMultipart([
      {
        name: "upload",
        filename: "big.txt",
        value: "this is more than 8 bytes",
      },
    ]);
    expect(res.status).toBe(413);
  });

  test("maxFieldSize: oversize text field → 413 (file-as-field smuggling defence)", async () => {
    await server(FIXTURE, {
      initialConfig: {
        server: { multipart: { maxFieldSize: 8 } },
      },
    });
    // Note: NO `filename=` — submitted as a plain field.  Without
    // maxFieldSize this would slip past any downstream `file()`
    // size policy.  With maxFieldSize, the cap fires.
    const res = await postMultipart([
      { name: "smuggled", value: "this is more than 8 bytes" },
    ]);
    expect(res.status).toBe(413);
  });

  test("maxFields: too many fields → 413", async () => {
    await server(FIXTURE, {
      initialConfig: {
        server: { multipart: { maxFields: 3 } },
      },
    });
    const parts = [];
    for (let i = 0; i < 10; i++) parts.push({ name: `f${i}`, value: `v${i}` });
    const res = await postMultipart(parts);
    expect(res.status).toBe(413);
  });

  test("maxFiles: too many file parts → 413", async () => {
    await server(FIXTURE, {
      initialConfig: {
        server: { multipart: { maxFiles: 2 } },
      },
    });
    const parts = [];
    for (let i = 0; i < 5; i++) {
      parts.push({ name: `file${i}`, filename: `f${i}.txt`, value: "x" });
    }
    const res = await postMultipart(parts);
    expect(res.status).toBe(413);
  });

  test("maxFieldNameSize: long field name → 413", async () => {
    await server(FIXTURE, {
      initialConfig: {
        server: { multipart: { maxFieldNameSize: 5 } },
      },
    });
    const res = await postMultipart([
      { name: "a-name-longer-than-five", value: "x" },
    ]);
    expect(res.status).toBe(413);
  });
});

describe("server.multipart — bypass conditions", () => {
  test("no caps configured → platform parser, all entries delivered", async () => {
    await server(FIXTURE);
    const parts = [];
    for (let i = 0; i < 50; i++) parts.push({ name: `f${i}`, value: `v${i}` });
    const res = await postMultipart(parts);
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out).toHaveLength(50);
  });

  test("caps configured but request is not multipart → cap doesn't apply", async () => {
    await server(FIXTURE, {
      initialConfig: {
        server: { multipart: { maxFieldSize: 1 } },
      },
    });
    // Plain text/plain POST — never enters the multipart branch.
    // The fixture's init$ calls request.formData() which throws on
    // non-multipart content-types; we get a non-413 result, which
    // is the correct signal that the multipart cap was bypassed.
    const res = await fetch(hostname, {
      method: "POST",
      body: "plain text body, well above 1 byte",
      headers: { "content-type": "text/plain" },
    });
    expect(res.status).not.toBe(413);
  });
});
