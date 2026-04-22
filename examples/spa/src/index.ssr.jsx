"use client";

import Activity from "./Activity.jsx";
import App from "./App.jsx";
import Comments from "./Comments.jsx";
import Html from "./Html.jsx";
import Products from "./Products.jsx";
import Stats from "./Stats.jsx";

// SSR shortcut variant entry: the "use client" directive makes the entire tree
// a client-root, so every component imported here — including the heavy
// sections — bundles as a client component and renders through React DOM's
// SSR pipeline directly, bypassing the RSC flight serializer entirely.
export default function Root() {
  return (
    <Html>
      <App>
        <Stats />
        <Products />
        <Activity />
        <Comments />
      </App>
    </Html>
  );
}
