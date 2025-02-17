export async function getPosts() {
  if (typeof document === "undefined") {
    const { default: posts } = await import("../data/posts.json");
    return posts;
  } else {
    const res = await fetch("/api/posts");
    return res.json();
  }
}
