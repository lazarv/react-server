import { getRuntime } from "@lazarv/react-server";
import { DEVTOOLS_CONTEXT } from "../../context.mjs";
import LivePanel from "../../client/panels/LivePanel.jsx";

export default async function LiveInspector() {
  const devtools = getRuntime(DEVTOOLS_CONTEXT);
  const liveComponents = devtools?.getLiveComponents() ?? [];

  return <LivePanel components={liveComponents} />;
}
