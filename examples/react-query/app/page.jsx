import { dehydrate, HydrationBoundary } from "@tanstack/react-query";

import CommentsServerComponent from "./comments-server";
import { getPosts } from "./get-posts";
import { getQueryClient } from "./get-query-client";
import Posts from "./posts";

export default function PostsPage() {
  const queryClient = getQueryClient();

  queryClient.prefetchQuery({
    queryKey: ["posts"],
    queryFn: getPosts,
  });

  return (
    <>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <h1>Posts</h1>
        <Posts />
        <h2>Comments</h2>
        <CommentsServerComponent />
      </HydrationBoundary>
    </>
  );
}
