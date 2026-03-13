import { Route } from "@lazarv/react-server/router";
import { Link } from "@lazarv/react-server/navigation";

import Settings from "./Settings.jsx";
import Profile from "./Profile.jsx";

export default function Dashboard() {
  const timestamp = new Date().toLocaleTimeString();

  return (
    <div>
      <h1>Dashboard (Server Component)</h1>
      <p>
        Server timestamp: <strong>{timestamp}</strong>
      </p>
      <p style={{ color: "gray", fontSize: "0.85rem" }}>
        This layout is a server component. The tabs below are client-only
        routes. Switching between tabs does NOT re-render this layout or hit the
        server.
      </p>

      <nav
        style={{
          display: "flex",
          gap: "1rem",
          margin: "1rem 0",
          borderBottom: "1px solid #ccc",
          paddingBottom: "0.5rem",
        }}
      >
        <Link to="/dashboard/settings" style={{ color: "purple" }}>
          Settings
        </Link>
        <Link to="/dashboard/profile" style={{ color: "purple" }}>
          Profile
        </Link>
      </nav>

      <Route path="/dashboard/settings" element={<Settings />} />
      <Route path="/dashboard/profile" element={<Profile />} />
    </div>
  );
}
