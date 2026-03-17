import { createRoute, createRouter } from "@lazarv/react-server/router";
import { Link } from "@lazarv/react-server/navigation";

import * as routes from "./routes";

import Home from "./Home";
import About from "./About";
import UserPage from "./UserPage";
import PostPage from "./PostPage";
import ProductList from "./ProductList";
import NotFound from "./NotFound";
import StripTrackingParams from "./StripTrackingParams";

// ── Create full typed routes from descriptors + elements ──
// The server `createRoute(descriptor, element)` overload takes a route
// descriptor (from routes.ts) and binds a React element to it, adding
// the .Route component. The .Link and .href() come from the descriptor.

const router = createRouter({
  home: createRoute(routes.home, <Home />),
  about: createRoute(routes.about, <About />),
  user: createRoute(routes.user, <UserPage />),
  post: createRoute(routes.post, <PostPage />),
  products: createRoute(routes.products, <ProductList />),
  notFound: createRoute(routes.notFound, <NotFound />),
});

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Typed Router Example</title>
      </head>
      <body>
        {/* Global SearchParams transform: strip utm_* and fbclid before
            any route validation/parsing sees them. */}
        <StripTrackingParams>
          <div style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
            <h1>Typed Router Example</h1>
            <p style={{ color: "gray" }}>
              Demonstrates <code>createRoute</code> / <code>createRouter</code>{" "}
              with both server and client routes, typed <code>.Link</code> and{" "}
              <code>.href()</code>, and bound hooks <code>.useParams()</code> /{" "}
              <code>.useSearchParams()</code> with Zod <code>validate</code>,
              lightweight <code>parse</code>, and <code>SearchParams</code>{" "}
              decode/encode transforms.
            </p>

            <nav
              style={{
                display: "flex",
                gap: "1rem",
                marginBottom: "1.5rem",
                flexWrap: "wrap",
              }}
            >
              {/* Typed .Link components from the router */}
              <router.home.Link style={{ color: "blue" }}>
                Home
              </router.home.Link>
              <router.about.Link style={{ color: "blue" }}>
                About
              </router.about.Link>
              <router.user.Link params={{ id: 42 }} style={{ color: "blue" }}>
                User 42
              </router.user.Link>
              <router.user.Link params={{ id: 99 }} style={{ color: "blue" }}>
                User 99
              </router.user.Link>
              <router.post.Link
                params={{ slug: "hello-world" }}
                style={{ color: "blue" }}
              >
                Post
              </router.post.Link>
              <router.products.Link style={{ color: "blue" }}>
                Products
              </router.products.Link>
              <router.products.Link
                style={{ color: "blue" }}
                search={{ sort: "price", page: 2 }}
              >
                Products (sorted)
              </router.products.Link>
              <Link to="/nonexistent" style={{ color: "blue" }}>
                404 Page
              </Link>
            </nav>

            <hr style={{ marginBottom: "1.5rem" }} />

            {/* Render all routes in declaration order */}
            <router.Routes />
          </div>
        </StripTrackingParams>
      </body>
    </html>
  );
}
