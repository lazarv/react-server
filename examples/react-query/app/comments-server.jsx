// app/posts/comments-server.jsx
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";

import Comments from "./comments";
import { getComments } from "./get-comments";
import { getQueryClient } from "./get-query-client";

export default function CommentsServerComponent() {
  const queryClient = getQueryClient();

  queryClient.prefetchQuery({
    queryKey: ["posts-comments"],
    queryFn: getComments,
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Comments />
    </HydrationBoundary>
  );
}
