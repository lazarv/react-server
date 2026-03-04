// app/StreamingList.jsx (Server Component)
import { Suspense } from "react";

import { getChunk } from "../data/getBigList";

const TOTAL_ITEMS = 10_000;
const CHUNK_SIZE = 100;

export default function StreamingList({
  totalItems = TOTAL_ITEMS,
  chunkSize = CHUNK_SIZE,
}) {
  // Calculate number of chunks but don't fetch data yet
  const numChunks = Math.ceil(totalItems / chunkSize);
  const chunkIndexes = Array.from({ length: numChunks }, (_, i) => i);

  return (
    <div style={{ maxHeight: "50vh", overflow: "auto" }}>
      <h1>Streaming {totalItems.toLocaleString()} items</h1>
      <ul>
        {chunkIndexes.map((chunkIndex) => (
          <Suspense
            key={chunkIndex}
            fallback={
              <ChunkPlaceholder index={chunkIndex} chunkSize={chunkSize} />
            }
          >
            {/* Each Chunk fetches its own data independently - enabling true streaming */}
            <Chunk
              index={chunkIndex}
              chunkSize={chunkSize}
              totalItems={totalItems}
            />
          </Suspense>
        ))}
      </ul>
    </div>
  );
}

function ChunkPlaceholder({ index, chunkSize }) {
  return (
    <>
      <li>
        Loading items {index * chunkSize + 1} - {(index + 1) * chunkSize} …
      </li>
    </>
  );
}

// Async server component for a chunk - fetches its own data
async function Chunk({ index, chunkSize, totalItems }) {
  // Each chunk independently fetches data with progressive delay
  const items = await getChunk(index, totalItems, chunkSize);

  return (
    <>
      {items.map((item, i) => (
        <li key={index * chunkSize + i}>{item}</li>
      ))}
    </>
  );
}
