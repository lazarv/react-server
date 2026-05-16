import { hostname, server } from "playground/utils";
import { beforeAll, describe, expect, test } from "vitest";

/**
 * Integration tests for CSRF / Origin validation on form-submit
 * action POSTs (`server.csrf`).
 *
 * The fixture page does nothing special; the spec sends raw
 * multipart POSTs with a `$ACTION_ID_<token>` field so the runtime
 * enters its action-dispatch block. The CSRF check fires before
 * any token decryption, so we don't need a valid token — we just
 * need the request to be action-shaped.
 *
 * "Passes CSRF" doesn't mean the request succeeded end-to-end —
 * the bogus action token causes the dispatch to fall through to
 * page render. We assert `status !== 403` and the absence of the
 * CSRF error header.
 *
 * Standalone unit verification of the `checkCsrf` resolver covers
 * Referer fallback, opaque `Origin: null`, regex `allowedOrigins`
 * entries, and CORS-set contribution — that runs against the
 * helper directly, separate from this Playwright-driven spec.
 */

const FIXTURE = "fixtures/csrf-action.jsx";

function buildActionMultipart() {
  // Fake action token. CSRF check fires before decryption, so the
  // token doesn't need to be valid for this test.
  const fakeToken = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const boundary = "rs-csrf-" + Math.random().toString(36).slice(2);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\n`, "utf8"),
    Buffer.from(
      `Content-Disposition: form-data; name="$ACTION_ID_${fakeToken}"\r\n\r\n`,
      "utf8"
    ),
    Buffer.from("\r\n", "utf8"),
    Buffer.from(`--${boundary}\r\n`, "utf8"),
    Buffer.from(`Content-Disposition: form-data; name="hello"\r\n\r\n`, "utf8"),
    Buffer.from("world\r\n", "utf8"),
    Buffer.from(`--${boundary}--\r\n`, "utf8"),
  ]);
  return {
    body,
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function postForm(headers = {}) {
  const { body, contentType } = buildActionMultipart();
  return fetch(hostname, {
    method: "POST",
    body,
    headers: { "content-type": contentType, ...headers },
  });
}

describe("server.csrf — default (lax) mode", () => {
  beforeAll(async () => {
    await server(FIXTURE);
  });

  test("same-origin form post passes (Origin matches server)", async () => {
    const url = new URL(hostname);
    const res = await postForm({ origin: url.origin });
    expect(res.status).not.toBe(403);
    expect(res.headers.get("x-react-server-action-error")).not.toBe(
      "csrf_origin_mismatch"
    );
  });

  test("cross-origin form post is rejected with 403", async () => {
    const res = await postForm({ origin: "https://evil.example.com" });
    expect(res.status).toBe(403);
    expect(res.headers.get("x-react-server-action-error")).toBe(
      "csrf_origin_mismatch"
    );
  });

  test("missing Origin/Referer is allowed in lax mode", async () => {
    const res = await postForm({});
    expect(res.status).not.toBe(403);
  });
});

describe("server.csrf — allowedOrigins", () => {
  beforeAll(async () => {
    await server(FIXTURE, {
      initialConfig: {
        server: {
          csrf: { allowedOrigins: ["https://host.example.com"] },
        },
      },
    });
  });

  test("cross-origin allowed via allowedOrigins entry", async () => {
    const res = await postForm({ origin: "https://host.example.com" });
    expect(res.status).not.toBe(403);
  });

  test("origin not in allowedOrigins still rejected", async () => {
    const res = await postForm({ origin: "https://other.example.com" });
    expect(res.status).toBe(403);
  });
});

describe("server.csrf — strict mode", () => {
  beforeAll(async () => {
    await server(FIXTURE, {
      initialConfig: { server: { csrf: { mode: "strict" } } },
    });
  });

  test("missing Origin is rejected in strict mode", async () => {
    const res = await postForm({});
    expect(res.status).toBe(403);
    expect(res.headers.get("x-react-server-action-error")).toBe(
      "csrf_origin_missing"
    );
  });

  test("matching Origin passes in strict mode", async () => {
    const url = new URL(hostname);
    const res = await postForm({ origin: url.origin });
    expect(res.status).not.toBe(403);
  });
});

describe("server.csrf — disabled", () => {
  beforeAll(async () => {
    await server(FIXTURE, {
      initialConfig: { server: { csrf: false } },
    });
  });

  test("csrf: false disables the check entirely", async () => {
    const res = await postForm({ origin: "https://evil.example.com" });
    expect(res.status).not.toBe(403);
  });
});

describe("server.csrf — header-based action calls bypass", () => {
  beforeAll(async () => {
    await server(FIXTURE);
  });

  test("header-based action call is NOT subject to CSRF (preflight-safe)", async () => {
    // JS-driven action call: react-server-action header present,
    // JSON body. This shape is preflight-required by the browser,
    // so CSRF doesn't fire. Even with a hostile Origin, the
    // runtime should not return csrf_origin_mismatch — it may fail
    // for other reasons (bogus token, etc.), but not on CSRF
    // grounds.
    const res = await fetch(hostname, {
      method: "POST",
      body: "[]",
      headers: {
        "content-type": "text/plain",
        "react-server-action": "fake-token",
        origin: "https://evil.example.com",
      },
    });
    expect(res.headers.get("x-react-server-action-error")).not.toBe(
      "csrf_origin_mismatch"
    );
  });
});
