import { redirect, usePathname } from "@lazarv/react-server";

export const priority = 200;

export default function RedirectMiddleware() {
  const pathname = usePathname();
  console.log("RedirectMiddleware - Current pathname:", pathname);
  if (pathname === "/redirect-notfound") {
    redirect("notexisting");
  }
  if (pathname === "/redirect-external") {
    redirect("https://react-server.dev");
  }
  if (pathname.startsWith("/redirect-api-external")) {
    console.log("Redirecting to /api-redirect");
    redirect("/api-redirect");
  }
}
