/**
 * Intercept process.stdout / process.stderr as early as possible so that
 * every line that appears in the terminal is also forwarded to the devtools
 * log panel.
 *
 * Call `installOutputCapture()` *before* any meaningful work starts — it
 * buffers entries until `connectDevToolsOutput(ctx)` is called with the
 * devtools context, at which point buffered entries are flushed and all
 * future writes go directly to `ctx.recordLog()`.
 */

let installed = false;
let buffer = [];
let devtoolsCtx = null;

// Strip non-SGR CSI escape sequences (cursor movement, line erasing, etc.)
// while preserving SGR color/style sequences (\x1b[...m).
// Also strips OSC sequences (\x1b]...\x07 or \x1b]...\x1b\\) used for
// terminal titles and hyperlinks.
/* oxlint-disable no-control-regex */
const CSI_NON_SGR_RE = new RegExp(
  "\\x1b\\[[0-9;]*[A-HJKSTfhlnr]|\\x1b\\][\\s\\S]*?(?:\\x07|\\x1b\\\\)|\\r",
  "g"
);
/* oxlint-enable no-control-regex */

function sanitize(raw) {
  return raw.replace(CSI_NON_SGR_RE, "");
}

function record(stream, chunk, encoding) {
  try {
    const raw =
      typeof chunk === "string"
        ? chunk
        : chunk.toString(typeof encoding === "string" ? encoding : "utf-8");
    const text = sanitize(raw);
    if (!text.trim()) return;

    if (devtoolsCtx) {
      devtoolsCtx.recordLog(stream, text);
    } else {
      buffer.push({ stream, text, timestamp: Date.now() });
      // Safety cap — drop oldest if we buffer too much before context is ready
      if (buffer.length > 2000) buffer.shift();
    }
  } catch {
    // never let devtools capture crash the server
  }
}

/**
 * Monkey-patch stdout/stderr.write.  Safe to call multiple times — only
 * the first call installs the patches.
 */
export function installOutputCapture() {
  if (installed) return;
  installed = true;

  const origStdoutWrite = process.stdout.write.bind(process.stdout);
  const origStderrWrite = process.stderr.write.bind(process.stderr);

  process.stdout.write = function (chunk, encoding, cb) {
    record("stdout", chunk, encoding);
    return origStdoutWrite(chunk, encoding, cb);
  };

  process.stderr.write = function (chunk, encoding, cb) {
    record("stderr", chunk, encoding);
    return origStderrWrite(chunk, encoding, cb);
  };
}

/**
 * Flush buffered entries into the devtools context and switch to direct
 * recording for all future writes.
 */
export function connectDevToolsOutput(ctx) {
  devtoolsCtx = ctx;

  // Replay buffered entries
  for (const entry of buffer) {
    ctx.recordLog(entry.stream, entry.text);
  }
  buffer = [];
}
