import { hostname, server } from "playground/utils";
import { Readable } from "node:stream";
import { describe, expect, test } from "vitest";

/**
 * Integration tests for the HTTP-layer body-size cap
 * (`server.maxBodyBytes`).
 *
 * The cap is enforced inside `createMiddleware` (the Node adapter)
 * and is plumbed there from `config.server.maxBodyBytes` by the dev
 * and production bootstraps. We drive the cap via `initialConfig`
 * so each test exercises the real config → middleware → handler
 * pipeline rather than poking the middleware in isolation.
 *
 * The fixture's `init$` returns a middleware that intercepts POSTs,
 * reads `request.arrayBuffer()` (going through the body-cap
 * Transform when the cap is enabled), and replies with a plain
 * `received:<n>` text Response. That puts a real body-reading
 * consumer in front of the wrapper without going through the
 * framework's POST → remote-props decode path.
 *
 * Runs on every adapter target — both the Node createMiddleware
 * path and the edge / serverless path apply the same cap, the
 * latter via the Web-Streams TransformStream wrap in
 * `adapters/shared/edge-body-caps.mjs`.
 */

const FIXTURE = "fixtures/body-cap.jsx";

async function postBody(body, headers = {}) {
  return fetch(hostname, { method: "POST", body, headers });
}

describe("server.maxBodyBytes — under cap", () => {
  test("POST below cap delivers the full body to the handler", async () => {
    await server(FIXTURE, {
      initialConfig: { server: { maxBodyBytes: 1024 } },
    });
    const res = await postBody("hello world", {
      "content-type": "text/plain",
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("received:11");
  });

  test("empty POST (Content-Length: 0) skips the wrapper and echoes 0", async () => {
    await server(FIXTURE, {
      initialConfig: { server: { maxBodyBytes: 1024 } },
    });
    // node-fetch sends Content-Length: 0 for an empty string body —
    // exactly the "explicit empty body" case the gate should skip.
    const res = await postBody("", { "content-type": "text/plain" });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("received:0");
  });
});

describe("server.maxBodyBytes — over cap", () => {
  test("declared Content-Length over cap → 413, body never read", async () => {
    await server(FIXTURE, {
      initialConfig: { server: { maxBodyBytes: 32 } },
    });
    const res = await postBody("x".repeat(64), {
      "content-type": "text/plain",
    });
    expect(res.status).toBe(413);
  });

  test("streaming body over cap (chunked, no Content-Length) is rejected", async () => {
    await server(FIXTURE, {
      initialConfig: { server: { maxBodyBytes: 32 } },
    });
    // Chunked POST (no Content-Length) — exercises the streaming
    // wrapper, not the cheap declared-length pre-check.  When the
    // wrapper Transform overflows it destroys the source socket
    // immediately to bound resource usage; the cap explicitly does
    // NOT try to read the rest of the attacker-controlled payload
    // just to deliver a courtesy 413, since that would defeat the
    // defense.  The connection close surfaces on the client side
    // as a fetch error (UND_ERR_SOCKET / ECONNRESET).
    //
    // Honest large uploads with a declared Content-Length take a
    // separate, earlier path that *does* deliver a clean 413
    // (covered by the test above).  This test asserts the *defense
    // properties* of the streaming path: the request was rejected
    // (either via 413 if Node managed to flush before close, or
    // via socket error if it didn't).  What matters is that the
    // server did not return a 200 — the cap was effective.
    const chunks = [];
    for (let i = 0; i < 10; i++) chunks.push(Buffer.alloc(10, "x"));
    const webStream = Readable.toWeb(Readable.from(chunks));
    let status = null;
    let fetchError = null;
    try {
      const res = await fetch(hostname, {
        method: "POST",
        body: webStream,
        duplex: "half",
        headers: { "content-type": "application/octet-stream" },
      });
      status = res.status;
    } catch (e) {
      fetchError = e;
    }
    // Either we got a 413 (best case) or fetch failed with a
    // socket-level error (acceptable — connection closed during
    // streaming overflow).  What we explicitly reject is a 200,
    // which would mean the handler successfully processed the
    // oversized payload.
    if (status !== null) {
      expect(status).toBe(413);
    } else {
      expect(fetchError).toBeTruthy();
      expect(fetchError.cause?.code ?? fetchError.code).toMatch(
        /UND_ERR_SOCKET|ECONNRESET/
      );
    }
  });
});

describe("server.maxBodyBytes — bypass conditions", () => {
  test("GET ignores the cap regardless of header values", async () => {
    await server(FIXTURE, {
      initialConfig: { server: { maxBodyBytes: 1 } },
    });
    const res = await fetch(hostname, {
      method: "GET",
      headers: { "content-length": "999999999" },
    });
    expect(res.status).toBe(200);
    // GET falls through `init$` to the page render.
    expect(await res.text()).toContain("idle");
  });

  test("maxBodyBytes: 0 disables the cap", async () => {
    await server(FIXTURE, {
      initialConfig: { server: { maxBodyBytes: 0 } },
    });
    const res = await postBody("x".repeat(1024), {
      "content-type": "text/plain",
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("received:1024");
  });
});
