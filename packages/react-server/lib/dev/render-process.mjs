import { createStdioPort } from "./render-process-channel.mjs";
import { alias } from "../loader/module-alias.mjs";
import { createLoggerProxy } from "./logger-proxy.mjs";
import * as sys from "../sys.mjs";

const parentPort = createStdioPort(Deno.stdin.readable, Deno.stdout.writable);

sys.experimentalWarningSilence();
// Pre-import dependencies to avoid module resolution issues in the worker thread.
await import("../build/dependencies.mjs");
// Deno: the import map covers ESM bare specifier resolution, but CJS
// require() inside packages like react-dom goes through Node-style
// node_modules resolution which can find a different React copy under
// pnpm.  Patch Module._resolveFilename the same way the Node.js path
// does so that require('react') etc. resolve to the aliased paths.
alias();
createLoggerProxy(parentPort);
const { renderWorker } = await import("./render-worker.mjs");
await renderWorker(parentPort, { clientAlias: () => [] });
