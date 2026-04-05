import { getRuntime } from "@lazarv/react-server";
import { rootDir } from "@lazarv/react-server/lib/sys.mjs";
import { DEVTOOLS_CONTEXT } from "../../context.mjs";

// Expose as a static method so DevToolsApp can call it directly
// and pass the result as serializable data to the client shell.
async function getManifest() {
  const devtools = getRuntime(DEVTOOLS_CONTEXT);
  const manifest = devtools?.getFileRouterManifest();

  if (!manifest) {
    return null;
  }

  const pages = (manifest.pages ?? []).map(
    ([src, path, outlet, type, ext]) => ({
      src,
      path,
      outlet: outlet || null,
      type: outlet ? "outlet" : type,
      ext,
    })
  );

  const middlewares = (manifest.middlewares ?? []).map(([src, path]) => ({
    src,
    path,
  }));

  const routes = (manifest.routes ?? []).map(([method, path, src]) => ({
    method,
    path,
    src,
  }));

  return { pages, middlewares, routes, cwd: process.cwd(), rootDir };
}

// Attach as static for direct invocation
const RouteInspector = { getManifest };
export default RouteInspector;
