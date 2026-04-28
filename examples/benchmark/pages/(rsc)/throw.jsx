// Test fixture: a route that throws synchronously during render.
// Used to verify afterHooks still fire on the error path with context.
import { after } from "@lazarv/react-server/server";

export default function Throw() {
  // Register an afterHook that logs to stderr. If the error path doesn't run
  // hooks correctly (or doesn't restore ContextStorage), we won't see the log.
  after((err) => {
    process.stderr.write(
      `[afterHook] fired with err=${err ? err.message : "(none)"}\n`
    );
  });
  throw new Error("intentional throw for afterHook test");
}
