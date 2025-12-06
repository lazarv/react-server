// Get a specific chunk with simulated delay (for true streaming)
export async function getChunk(
  chunkIndex,
  totalItems = 10_000,
  chunkSize = 100
) {
  // Simulate progressive data fetching - each chunk takes incrementally longer
  // This creates a waterfall effect where chunks appear one after another
  const delay = chunkIndex * 100; // 0ms, 100ms, 200ms, 300ms, etc.

  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  const startIndex = chunkIndex * chunkSize;
  const endIndex = Math.min(startIndex + chunkSize, totalItems);

  return Array.from(
    { length: endIndex - startIndex },
    (_, i) => `Item #${startIndex + i + 1}`
  );
}
