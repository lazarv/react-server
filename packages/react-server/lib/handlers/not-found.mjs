export default async function notFoundHandler() {
  return async () => {
    return new Response("Not Found", { status: 404 });
  };
}
