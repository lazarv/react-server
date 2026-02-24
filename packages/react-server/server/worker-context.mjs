import { AsyncLocalStorage } from "node:async_hooks";

export const WorkerContextStorage =
  (globalThis.__react_server_worker_context__ =
    globalThis.__react_server_worker_context__ || new AsyncLocalStorage());

export function getWorkerContext() {
  return WorkerContextStorage.getStore() ?? {};
}

export function getAbortSignal() {
  return getWorkerContext().signal ?? null;
}
