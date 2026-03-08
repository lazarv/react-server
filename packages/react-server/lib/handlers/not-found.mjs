export default async function notFoundHandler() {
  return async function notFound() {
    return new Response("Not Found", { status: 404 });
  };
}
