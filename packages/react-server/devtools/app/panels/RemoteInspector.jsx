import { getRuntime } from "@lazarv/react-server";
import { DEVTOOLS_CONTEXT } from "../../context.mjs";
import RemotePanel from "../../client/panels/RemotePanel.jsx";

export default async function RemoteInspector() {
  const devtools = getRuntime(DEVTOOLS_CONTEXT);
  const remoteComponents = devtools?.getRemoteComponents() ?? [];

  return <RemotePanel components={remoteComponents} />;
}
