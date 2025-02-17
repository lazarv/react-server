import posts from "../../data/posts.json";

export default async function GET() {
  return new Response(JSON.stringify(posts), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
