"use server";

import { createFunction, file, formData } from "@lazarv/react-server/function";

/**
 * Server actions for the file-upload integration spec.
 *
 * Each action reads the uploaded file(s), computes a SHA-256 hex
 * digest of the bytes via Web Crypto (available globally in Node 20+),
 * and returns the digest plus filename / type / size metadata. The
 * spec recomputes the digest from the same byte source it sent and
 * asserts equality — proving the bytes survived the full round-trip
 * through the multipart wire, the WHATWG Request, and (when
 * `server.multipart.*` is configured) the busboy-driven streaming
 * parse.
 */

// Minimal Standard-Schema duck-type for string fields, matching the
// inline pattern in server-function-validation-actions.mjs. Keeps
// the fixture dep-light — `safeValidate` in the runtime accepts any
// object with `safeParse` / `assert` / `parse`.
function strSchema() {
  return {
    safeParse(v) {
      if (typeof v === "string") return { success: true, data: v };
      return { success: false, error: { message: "expected string" } };
    },
  };
}

async function sha256Hex(blobOrBuffer) {
  const buf =
    blobOrBuffer instanceof ArrayBuffer
      ? blobOrBuffer
      : await blobOrBuffer.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Single-file upload via createFunction's formData() / file() spec ──
//
// Validates only the shape of the upload (a single `photo` file, no
// extra fields). The maxBytes is generous so the spec can drive
// content-fidelity scenarios up to 256 KiB; per-byte limits aren't
// what's under test here — bytes-arrived-intact is.
export const uploadValidated = createFunction([
  formData({
    photo: file({ maxBytes: 256 * 1024 }),
  }),
])(async function uploadValidated(form) {
  const photo = form.get("photo");
  return {
    kind: "ok",
    name: photo.name,
    type: photo.type,
    size: photo.size,
    sha256: await sha256Hex(photo),
  };
});

// ─── Bare "use server" upload — receives raw FormData, no slot-walk
// validation. Proves that the platform `request.formData()` path
// (no createFunction wrapper) still surfaces files with intact
// bytes. This is the "back-compat" channel for users who haven't
// adopted the validated wrappers.
export async function uploadBare(form) {
  const out = [];
  for (const [name, value] of form.entries()) {
    if (typeof value === "string") {
      out.push({ name, kind: "field", value });
    } else {
      out.push({
        name,
        kind: "file",
        filename: value.name,
        type: value.type,
        size: value.size,
        sha256: await sha256Hex(value),
      });
    }
  }
  return { kind: "ok", entries: out };
}

// ─── Multi-file + mixed-fields upload ─────────────────────────────────
//
// Validates a FormData with exactly two files (`a`, `b`) plus a
// `caption` text field. Exercises:
//
//   - multiple file entries in a single multipart body
//   - text + binary entries mixed together
//   - per-entry bytes survive independently
//   - field ordering + value preservation through the wire
export const uploadMixed = createFunction([
  formData({
    caption: strSchema(),
    a: file({ maxBytes: 256 * 1024 }),
    b: file({ maxBytes: 256 * 1024 }),
  }),
])(async function uploadMixed(form) {
  const a = form.get("a");
  const b = form.get("b");
  return {
    kind: "ok",
    caption: form.get("caption"),
    a: { name: a.name, type: a.type, size: a.size, sha256: await sha256Hex(a) },
    b: { name: b.name, type: b.type, size: b.size, sha256: await sha256Hex(b) },
  };
});
