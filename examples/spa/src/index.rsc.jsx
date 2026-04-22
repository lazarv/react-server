import Activity from "./Activity.jsx";
import App from "./App.jsx";
import Comments from "./Comments.jsx";
import Html from "./Html.jsx";
import Products from "./Products.jsx";
import Stats from "./Stats.jsx";

// RSC variant entry: this module has no "use client" directive, so the heavy
// sections render as server components and ship to the client as serialized
// React elements in the flight payload (no client component code for them).
// `<App>` is the only "use client" boundary — it receives the pre-rendered
// children through the flight.
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
