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
}
