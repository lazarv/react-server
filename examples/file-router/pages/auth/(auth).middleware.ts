import { redirect, usePathname } from "@lazarv/react-server";

export const priority = 200;

export default function AuthMiddleware() {
  const pathname = usePathname();
  console.log("AuthMiddleware - Current pathname:", pathname);

  if (pathname === "/auth") {
    redirect("/auth/login?from=" + encodeURIComponent(pathname));
  }
}
