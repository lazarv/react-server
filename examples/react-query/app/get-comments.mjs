export async function getComments() {
  if (typeof document === "undefined") {
    const { default: comments } = await import("../data/comments.json");
    return comments;
  } else {
    const res = await fetch("/api/comments");
    return res.json();
  }
}
