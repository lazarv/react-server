import { redirect } from "@lazarv/react-server";

export const priority = 100;

export default function AuthSlugMiddleware({
  request: {
    params: { slug },
  },
}) {
  console.log("AuthSlugMiddleware - Params:", slug);
  if (slug.length > 1 || slug[0] !== "login") {
    redirect(
      "/auth/login?slug=" + encodeURIComponent("/auth/" + slug.join("/"))
    );
  }
}
