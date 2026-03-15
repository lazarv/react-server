import { dashboard } from "@lazarv/react-server/routes";

export default dashboard.createLayout(({ children, sidebar, content }) => {
  return (
    <div>
      <h1>Dashboard</h1>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "200px 1fr",
          gap: "20px",
          minHeight: "300px",
        }}
      >
        <aside
          style={{
            background: "#f5f5f5",
            padding: "16px",
            borderRadius: "8px",
          }}
        >
          <h3>Sidebar</h3>
          {sidebar}
        </aside>
        <main>
          <div
            style={{
              background: "#fafafa",
              padding: "16px",
              borderRadius: "8px",
              marginBottom: "16px",
            }}
          >
            <h3>Content</h3>
            {content}
          </div>
          <div>{children}</div>
        </main>
      </div>
    </div>
  );
});
