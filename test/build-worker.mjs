// Build worker — runs react-server build in an isolated child process.
// This prevents Rolldown's native stdout writes from blocking the
// test process event loop when the OS pipe buffer fills up.

const root = process.env.BUILD_ROOT || undefined;
const options = JSON.parse(process.env.BUILD_OPTIONS);

try {
  const { build } = await import("@lazarv/react-server/build");
  const result = await build(root || undefined, {
    ...options,
    // Silence by default to keep test output readable, but flip to
    // verbose whenever a build returns a non-success exit so the actual
    // Rolldown/Vite error reaches the test log. Otherwise auxServer()
    // surfaces only "Build failed" with no detail (the chokidar/fsevents
    // failure on Linux CI was invisible for exactly this reason).
    silent:
      typeof process.env.REACT_SERVER_VERBOSE === "undefined" ||
      typeof process.env.REACT_SERVER_BUILD_SILENT !== "undefined",
  });
  if (result === 1) {
    // On failure, re-run the build with verbose logging so the
    // underlying error surfaces in stdout/stderr (which inherit to the
    // parent test process). The second build is fast — it'll hit the
    // same error path early. This keeps the green path quiet and only
    // pays the verbosity cost on actual failures.
    if (process.env.REACT_SERVER_VERBOSE === undefined) {
      try {
        await build(root || undefined, { ...options, silent: false });
      } catch (e2) {
        process.send({
          type: "error",
          error: e2.stack || e2.message || String(e2),
        });
        process.exit(1);
      }
    }
    process.send({
      type: "error",
      error:
        "Build failed (re-ran verbose; see stdout/stderr above for the underlying Rolldown/Vite error)",
    });
    process.exit(1);
  }
  process.send({ type: "done" });
  process.exit(0);
} catch (e) {
  process.send({ type: "error", error: e.stack || e.message || String(e) });
  process.exit(1);
}
