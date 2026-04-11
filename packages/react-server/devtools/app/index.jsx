import { Suspense } from "react";

import { cookie } from "@lazarv/react-server/server/cookies.mjs";
import DevToolsShell from "../client/DevToolsShell.jsx";
import StatusPanel from "./panels/StatusPanel.jsx";
import RouteInspector from "./panels/RouteInspector.jsx";

// Inline script that runs before React hydrates to set the dark class,
// preventing a light → dark flash. Reads the parent page's cookie.
const THEME_SCRIPT = `(function(){try{var d=parent.document.cookie;if(d.indexOf("dark=1")!==-1){document.documentElement.classList.add("dark")}else if(d.indexOf("dark=0")===-1&&matchMedia("(prefers-color-scheme:dark)").matches){document.documentElement.classList.add("dark")}}catch(e){}})()`;

export default async function DevToolsApp() {
  // Read cookie on the server so SSR output already has the right theme
  const cookies = cookie();
  const serverDark = cookies.dark === "1";

  // Fetch route manifest on the server so we can pass it as serializable data
  const routeManifest = await RouteInspector.getManifest();

  return (
    <html
      lang="en"
      className={serverDark ? "dark" : ""}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <DevToolsShell
          initialDark={serverDark}
          routeManifest={routeManifest}
          statusPanel={
            <Suspense fallback={null}>
              <StatusPanel />
            </Suspense>
          }
        />
      </body>
    </html>
  );
}
