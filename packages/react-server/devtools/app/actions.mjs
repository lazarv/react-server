"use server";

import { invalidate } from "@lazarv/react-server/memory-cache";
import { getRuntime } from "@lazarv/react-server";
import { DEVTOOLS_CONTEXT } from "../context.mjs";

export async function invalidateEntry(key, provider) {
  await invalidate(key, provider);
}

export async function clearCacheProvider(providerName) {
  const devtools = getRuntime(DEVTOOLS_CONTEXT);
  await devtools?.clearProvider?.(providerName);
}
