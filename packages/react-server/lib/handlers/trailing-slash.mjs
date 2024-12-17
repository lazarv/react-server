export default async function trailingSlash() {
  return async ({ url: { pathname }, request: { method } }) => {
    if (
      pathname !== "/" &&
      pathname.endsWith("/") &&
      (method === "GET" || method === "HEAD")
    ) {
      return new Response(null, {
        status: 301,
        headers: {
          Location: pathname.replace(/\/+$/g, "") || "/",
        },
      });
    }
  };
}
