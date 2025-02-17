import comments from "../../data/comments.json";

export default async function GET() {
  return new Response(JSON.stringify(comments), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
