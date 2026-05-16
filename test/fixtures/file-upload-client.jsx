"use client";

import {
  uploadBare,
  uploadMixed,
  uploadValidated,
} from "./file-upload-actions.mjs";

/**
 * Driver for the file-upload integration spec. Each button
 * constructs a `File` from a deterministic byte pattern, calls the
 * matching server action, and stashes the result on
 * `window.__react_server_result__`. The spec recomputes the digest
 * from the same byte source it constructed the File with and asserts
 * equality.
 *
 * The byte patterns come from a small PRNG-ish helper
 * (`generateBytes`) so the same `(seed, len)` always produces the
 * same buffer — the spec uses that to produce its expected digest.
 */

// xorshift32-style sequence — deterministic, fast, good enough for
// content-fidelity checks (NOT for crypto). The spec mirrors this
// exact function so it can compute the expected SHA-256 over the
// same bytes.
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

function makeFile(seed, len, name, type) {
  const bytes = generateBytes(seed, len);
  return new File([bytes], name, { type });
}

export default function FileUploadClient() {
  const call = (testid, run) => (
    <button
      key={testid}
      data-testid={testid}
      onClick={async () => {
        window.__react_server_result__ = undefined;
        try {
          window.__react_server_result__ = await run();
        } catch (e) {
          window.__react_server_result__ = {
            kind: "clientError",
            message: e?.message ?? String(e),
          };
        }
      }}
    >
      {testid}
    </button>
  );

  return (
    <div>
      {call("u-validated-small", () => {
        const fd = new FormData();
        fd.set(
          "photo",
          makeFile(101, 16, "small.bin", "application/octet-stream")
        );
        return uploadValidated(fd);
      })}

      {call("u-validated-large", () => {
        const fd = new FormData();
        // 64 KiB — non-trivial size, exercises chunked multipart
        // encoding through the wire.
        fd.set(
          "photo",
          makeFile(202, 64 * 1024, "big.bin", "application/octet-stream")
        );
        return uploadValidated(fd);
      })}

      {call("u-validated-empty", () => {
        const fd = new FormData();
        fd.set(
          "photo",
          new File([], "empty.bin", { type: "application/octet-stream" })
        );
        return uploadValidated(fd);
      })}

      {call("u-validated-utf8-name", () => {
        const fd = new FormData();
        // Non-ASCII filename + custom MIME — both must round-trip.
        fd.set(
          "photo",
          makeFile(303, 32, "ファイル-π.dat", "application/x-react-server-test")
        );
        return uploadValidated(fd);
      })}

      {call("u-bare-multi", () => {
        const fd = new FormData();
        fd.set("caption", "hello world");
        fd.append(
          "files",
          makeFile(404, 24, "f1.bin", "application/octet-stream")
        );
        fd.append(
          "files",
          makeFile(505, 48, "f2.bin", "application/octet-stream")
        );
        return uploadBare(fd);
      })}

      {call("u-mixed", () => {
        const fd = new FormData();
        fd.set("caption", "two files plus text");
        fd.set("a", makeFile(606, 100, "a.bin", "application/octet-stream"));
        fd.set("b", makeFile(707, 200, "b.bin", "application/octet-stream"));
        return uploadMixed(fd);
      })}
    </div>
  );
}
