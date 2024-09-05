// app/posts/posts.jsx
"use client";

import "./posts.css";

import { useSuspenseQuery } from "@tanstack/react-query";

import { getPosts } from "./get-posts.mjs";

export default function Posts() {
  // This useQuery could just as well happen in some deeper
  // child to <Posts>, data will be available immediately either way
  const { data } = useSuspenseQuery({ queryKey: ["posts"], queryFn: getPosts });

  return (
    <div className="posts-container">
      {data.map((post) => (
        <div key={post.id} className="post-card">
          <h2 className="post-title">{post.title}</h2>
          <p className="post-body">{post.body}</p>
        </div>
      ))}
    </div>
  );
}
