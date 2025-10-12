import { getContext } from "@lazarv/react-server/server/context.mjs";

import { dynamicHookError } from "../lib/utils/error.mjs";
import { usePostpone } from "./postpone.mjs";
import { useUrl } from "./request.mjs";
import { CACHE_CONTEXT } from "./symbols.mjs";

const revalidateQueue = [];

export function revalidate(key) {
  usePostpone(dynamicHookError("revalidate"));

  revalidateQueue.push(async () => {
    const url = useUrl();
    const cache = getContext(CACHE_CONTEXT);

    const keyToDelete = key ?? url;
    await cache.delete(keyToDelete);
  });
}

export async function init$() {
  while (revalidateQueue.length > 0) {
    await revalidateQueue.shift().call(null);
  }
}
