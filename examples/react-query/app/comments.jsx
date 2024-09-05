"use client";

import "./comments.css";

import { useSuspenseQuery } from "@tanstack/react-query";

import { getComments } from "./get-comments";

export default function Comments() {
  const { data } = useSuspenseQuery({
    queryKey: ["posts-comments"],
    queryFn: getComments,
  });

  return (
    <div className="comments-container">
      {data.map((comment) => (
        <div key={comment.id} className="comment-card">
          <h3 className="comment-name">{comment.name}</h3>
          <p className="comment-email">{comment.email}</p>
          <p className="comment-body">{comment.body}</p>
        </div>
      ))}
    </div>
  );
}
