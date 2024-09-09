export async function getComments() {
  const res = await fetch("https://jsonplaceholder.typicode.com/comments");
  return res.json();
}
