import { redirect, usePathname } from "@lazarv/react-server";

export const priority = 200;

export default function RedirectMiddleware() {
  const pathname = usePathname();
  if (pathname === "/redirect-notfound") {
    redirect("notexisting");
  }
  if (pathname === "/redirect-external") {
    redirect("https://react-server.dev");
  }
  if (pathname.startsWith("/redirect-api-external")) {
    redirect("/api-redirect");
  }
  if (pathname === "/redirect-about") {
    redirect("/about");
  }
  // Redirect kind examples
  if (pathname === "/redirect-push") {
    redirect("/about", 302, "push");
  }
  if (pathname === "/redirect-location") {
    redirect("/about", 302, "location");
  }
  if (pathname === "/redirect-location-external") {
    redirect("https://react-server.dev", 302, "location");
  }
  if (pathname === "/redirect-error") {
    redirect("/about", 302, "error");
  }
}
