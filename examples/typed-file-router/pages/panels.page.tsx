import { sidebar, content } from "@lazarv/react-server/outlets";

// Demonstrates the per-outlet bound `ReactServerComponent` exposed by
// `@lazarv/react-server/outlets`. Each export is a namespace per outlet
// declared in the file-router; `.Outlet` is the bound component.
//
//   <sidebar.Outlet url="/dashboard/nav" />
//
// The component closes over its outlet name, so call sites only need to
// pass `url` — typed against the route table, just like `Link.to`. The
// return value is branded `Outlet<"sidebar">` / `Outlet<"content">`, so
// it can satisfy a `createLayout` slot of the same name without losing
// the brand.
export default function Panels() {
  return (
    <div>
      <h1>Panels</h1>
      <p>
        This page mounts named outlets directly via the typed{" "}
        <code>@lazarv/react-server/outlets</code> module — no layout wiring, no
        stringly-typed <code>outlet</code> prop.
      </p>
      <div
        data-testid="panels-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "200px 1fr",
          gap: "20px",
          minHeight: "200px",
        }}
      >
        <aside
          data-testid="panels-sidebar"
          style={{
            background: "#f5f5f5",
            padding: "16px",
            borderRadius: "8px",
          }}
        >
          <h3>Sidebar (bound outlet)</h3>
          <sidebar.Outlet url="/dashboard/nav" />
        </aside>
        <main
          data-testid="panels-content"
          style={{
            background: "#fafafa",
            padding: "16px",
            borderRadius: "8px",
          }}
        >
          <h3>Content (bound outlet)</h3>
          <content.Outlet url="/dashboard/feed" />
        </main>
      </div>
    </div>
  );
}
