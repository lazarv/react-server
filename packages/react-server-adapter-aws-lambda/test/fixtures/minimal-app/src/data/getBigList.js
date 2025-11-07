// app/data/getBigList.ts (server-only)
export async function getBigList() {
  // simulate data
  return Array.from({ length: 10_000 }, (_, i) => `Item #${i + 1}`);
}
