import { createFileRoute, useRouter } from "@tanstack/react-router";

export const Route = createFileRoute("/posts")({
  loader: ({
    context: {
      outlets,
      client: { refresh, getFlightResponse },
    },
    cause,
  }) => {
    if (cause === "stay") {
      delete outlets.posts;
      refresh("posts");
    }
    if (outlets.posts) {
      return Promise.resolve(outlets.posts);
    }
    return getFlightResponse("/posts", { outlet: "posts" });
  },
  component: Posts,
});

function Posts() {
  const data = Route.useLoaderData();
  const router = useRouter();

  return (
    <div>
      <h1>Posts</h1>
      {data}
      <button
        className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-blue-300"
        onClick={() => router.invalidate()}
      >
        Refresh
      </button>
    </div>
  );
}
