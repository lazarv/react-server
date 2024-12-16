import { ReactServerComponent } from "@lazarv/react-server/navigation";
import ServerFunctionTypesActions from "./server-function-types-actions.jsx";
import { outlet } from "@lazarv/react-server";
import { useActionState } from "@lazarv/react-server/router";
import { reloadAction } from "./actions.mjs";

export default function ServerFunctionTypes() {
  const currentOutlet = outlet();
  const { data, error } = useActionState(reloadAction);

  if (error) {
    return <pre>{error.stack}</pre>;
  }

  if (currentOutlet === "rsf") {
    return <pre>{JSON.stringify(data, null, 2)}</pre>;
  }

  return (
    <>
      <ServerFunctionTypesActions />
      <ReactServerComponent outlet="rsf" />
    </>
  );
}
