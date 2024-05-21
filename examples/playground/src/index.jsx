import {
  cookie,
  deleteCookie,
  redirect,
  rewrite,
  setCookie,
  useFormData,
  useUrl,
} from "@lazarv/react-server";
import ErrorBoundary from "@lazarv/react-server/error-boundary";
import { Link } from "@lazarv/react-server/navigation";
import { Route } from "@lazarv/react-server/router";

import App from "./App.jsx";
import InternalServerError from "./InternalServerError.jsx";
import ItemDetails from "./ItemDetails.jsx";
import Items from "./Items.jsx";
import Layout from "./Layout.jsx";
import NotFound from "./NotFound.jsx";

export function init$() {
  return async () => {
    const cookies = cookie();
    const { pathname, searchParams } = useUrl();
    if (pathname === "/logout") {
      deleteCookie("sid");
      return new Response('Logged out!<br><a href="/login">Login</a>', {
        status: 200,
        headers: {
          "content-type": "text/html",
        },
      });
    }
    if (pathname === "/auth") {
      const formData = await useFormData();
      if (formData.get("username") !== "admin") {
        return new Response("Invalid username!", {
          status: 401,
          headers: {
            "content-type": "text/plain",
          },
        });
      }
      if (formData.get("password") !== "admin") {
        return new Response("Invalid password!", {
          status: 401,
          headers: {
            "content-type": "text/plain",
          },
        });
      }
      setCookie("sid", "admin");
      redirect(searchParams?.get("redirect") ?? "/");
    }
    if (!cookies.sid) {
      if (pathname !== "/login") {
        redirect(`/login?redirect=${pathname}`);
      } else if (pathname === "/login") {
        return new Response(
          `<form action="/auth?redirect=${
            searchParams?.get("redirect") ?? "/"
          }" method="POST">
            <input type="text" name="username" placeholder="Username" />
            <input type="password" name="password" placeholder="Password" />
            <input type="submit" value="Login" />
          </form>`,
          {
            status: 200,
            headers: {
              "content-type": "text/html",
            },
          }
        );
      }
    }
    if (pathname === "/items4") {
      rewrite("/items");
    }
  };
}

export default function Router() {
  return (
    <Route path="/" render={Layout} standalone={false} remote={false}>
      <Route path="/" exact element={<App />} />
      <Route path="/items" element={<Items />} />
      <Route
        path="/items2"
        element={
          <ErrorBoundary component={InternalServerError}>
            <h1>ITEMS 2!</h1>
            <Link to="/items">
              <button>Navigate back to Items!</button>
            </Link>
          </ErrorBoundary>
        }
      />
      <Route path="/items3" render={() => redirect("/items")} />
      <Route path="/items/[id]" render={({ id }) => <ItemDetails id={id} />} />
      <Route
        path="/items/[...slug]"
        render={({ slug }) => (
          <>
            <h1>Item Path</h1>
            <ol>
              {slug.map((segment) => (
                <li key={segment}>/{segment}</li>
              ))}
            </ol>
          </>
        )}
      />
      <Route
        path="/items/[...slug]/info-[prop]"
        render={({ prop }) => (
          <>
            <h1>Info Property: {prop}</h1>
          </>
        )}
      />
      <Route fallback element={<NotFound />} />
    </Route>
  );
}
