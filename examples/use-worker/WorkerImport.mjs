"use worker";

import { getSystemInfo } from "./WorkerModule.mjs";

export async function getWorkerSystemInfo() {
  return getSystemInfo();
}
