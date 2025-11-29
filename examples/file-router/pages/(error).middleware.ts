import { usePathname } from "@lazarv/react-server";

export default function RedirectMiddleware() {
  const pathname = usePathname();
  if (pathname === "/middleware-error") {
    throw new Error("Error thrown in middleware");
  }
}
