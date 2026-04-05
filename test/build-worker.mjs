// Build worker — runs react-server build in an isolated child process.
// This prevents Rolldown's native stdout writes from blocking the
// test process event loop when the OS pipe buffer fills up.

const root = process.env.BUILD_ROOT || undefined;
const options = JSON.parse(process.env.BUILD_OPTIONS);

try {
  const { build } = await import("@lazarv/react-server/build");
  const result = await build(root || undefined, {
    ...options,
    silent:
      typeof process.env.REACT_SERVER_VERBOSE === "undefined" ||
      typeof process.env.REACT_SERVER_BUILD_SILENT !== "undefined",
  });
  if (result === 1) {
    process.send({ type: "error", error: "Build failed" });
    process.exit(1);
  }
  process.send({ type: "done" });
  process.exit(0);
} catch (e) {
  process.send({ type: "error", error: e.stack || e.message || String(e) });
  process.exit(1);
}
