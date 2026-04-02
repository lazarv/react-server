import { Route } from "@lazarv/react-server/router";
import { Link } from "@lazarv/react-server/navigation";

import AuthGuard from "./AuthGuard.jsx";
import ScrollConfig from "./ScrollConfig.jsx";
import Sidebar from "./Sidebar.jsx";
import Home from "./Home.jsx";
import About from "./About.jsx";
import UserPage from "./UserPage.jsx";
import ServerPage from "./ServerPage.jsx";
import Dashboard from "./Dashboard.jsx";
import SlowPage from "./SlowPage.jsx";
import SlowPageSkeleton from "./SlowPageSkeleton.jsx";
import ProtectedPage from "./ProtectedPage.jsx";
import LongPage from "./LongPage.jsx";
import ServerLongPage from "./ServerLongPage.jsx";
import Products from "./Products.jsx";
import NotFound from "./NotFound.jsx";

export default function App() {
  return (
    <AuthGuard>
      <ScrollConfig />
      <div style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
        <nav
          style={{
            display: "flex",
            gap: "1rem",
            marginBottom: "2rem",
            flexWrap: "wrap",
          }}
        >
          <Link to="/" style={{ color: "blue" }}>
            Home
          </Link>
          <Link to="/about" style={{ color: "blue" }}>
            About
          </Link>
          <Link to="/user/42" style={{ color: "blue" }}>
            User 42
          </Link>
          <Link to="/server" style={{ color: "blue" }}>
            Server Page
          </Link>
          <Link to="/dashboard/settings" style={{ color: "blue" }}>
            Dashboard
          </Link>
          <Link to="/slow" style={{ color: "blue" }}>
            Slow Page
          </Link>
          <Link to="/protected" style={{ color: "blue" }}>
            Protected (redirect)
          </Link>
          <Link to="/products" style={{ color: "blue" }}>
            Products (filter)
          </Link>
          <Link to="/long" style={{ color: "blue" }}>
            Long Page (scroll)
          </Link>
          <Link to="/server-long" style={{ color: "blue" }}>
            Server Long (scroll)
          </Link>
          <Link to="/nonexistent" style={{ color: "blue" }}>
            404 Page
          </Link>
        </nav>

        <hr />

        <div style={{ display: "flex", gap: "1.5rem" }}>
          {/* Sidebar with useScrollContainer — its scroll position is saved & restored */}
          <Sidebar />

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Client-only routes: navigation between these skips the server */}
            <Route path="/" exact element={<Home />} />
            <Route path="/about" element={<About />} />

            {/* Client route with useMatch() to read params */}
            <Route path="/user/[id]" element={<UserPage />} />

            {/* Server route: always fetches from the server */}
            <Route path="/server" element={<ServerPage />} />

            {/* Server layout with nested client-only routes (protected by AuthGuard) */}
            <Route path="/dashboard" element={<Dashboard />} />

            {/* Slow server route with client-only loading skeleton */}
            <Route
              path="/slow"
              loading={SlowPageSkeleton}
              element={<SlowPage />}
            />

            {/* Client route demonstrating redirect() during render */}
            <Route path="/protected" element={<ProtectedPage />} />

            {/* Product listing — sort/filter changes URL but useScrollPosition keeps scroll */}
            <Route path="/products" element={<Products />} />

            {/* Tall client route to demo scroll restoration */}
            <Route path="/long" element={<LongPage />} />

            {/* Tall server route to demo flash-free scroll restoration on refresh */}
            <Route path="/server-long" element={<ServerLongPage />} />

            {/* Client-only fallback: 404 without a server request */}
            <Route fallback element={<NotFound />} />
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
