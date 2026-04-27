// Test fixture: a route that takes ~2s to respond.
// Used to verify graceful shutdown drains in-flight requests.
export default async function Slow() {
  await new Promise((r) => setTimeout(r, 2000));
  return <div>slow ok</div>;
}
