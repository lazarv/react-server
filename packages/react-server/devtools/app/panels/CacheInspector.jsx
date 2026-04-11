import { getRuntime } from "@lazarv/react-server";
import { DEVTOOLS_CONTEXT } from "../../context.mjs";
import CachePanel from "../../client/panels/CachePanel.jsx";

export default async function CacheInspector() {
  const devtools = getRuntime(DEVTOOLS_CONTEXT);
  const events = devtools?.getCacheEvents() ?? [];

  // For now, pass cache events. Full entry enumeration will be added
  // once we export getCacheInstances() from cache/index.mjs.
  return <CachePanel events={events} />;
}
