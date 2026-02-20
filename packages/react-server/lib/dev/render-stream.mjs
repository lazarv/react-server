import { register } from "node:module";
import { parentPort } from "node:worker_threads";

import { alias } from "../loader/module-alias.mjs";
import { createLoggerProxy } from "./logger-proxy.mjs";
import * as sys from "../sys.mjs";

sys.experimentalWarningSilence();
// Pre-import dependencies to avoid module resolution issues in the worker thread.
await import("../build/dependencies.mjs");
alias();
register("../loader/node-loader.mjs", import.meta.url);
createLoggerProxy(parentPort);
const { renderWorker } = await import("./render-worker.mjs");
await renderWorker(parentPort);
