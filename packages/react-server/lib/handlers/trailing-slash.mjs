export default async function trailingSlash() {
  return async ({ url: { pathname } }) => {
    if (pathname !== "/" && pathname.endsWith("/")) {
      return new Response(null, {
        status: 301,
        headers: {
          Location: pathname.replace(/\/+$/g, "") || "/",
        },
      });
    }
  };
}
