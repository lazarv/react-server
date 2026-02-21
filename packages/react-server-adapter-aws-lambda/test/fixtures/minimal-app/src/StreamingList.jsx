// app/StreamingList.tsx (Server Component)
import React, { Suspense } from "react";

import { chunkList } from "./data/chunkList";
import { getBigList } from "./data/getBigList";

const CHUNK_SIZE = 200;

export default async function StreamingList({ chunkSize = CHUNK_SIZE }) {
  const allItems = await getBigList();
  const chunks = chunkList(allItems, chunkSize);

  return (
    <div>
      <h1>Streaming {allItems.length.toLocaleString()} items</h1>
      <ul>
        {chunks.map((chunk, i) => (
          <Suspense key={i} fallback={<ChunkPlaceholder index={i} />}>
            {/* This async component is what enables streaming */}
            <Chunk index={i} items={chunk} />
          </Suspense>
        ))}
      </ul>
    </div>
  );
}

function ChunkPlaceholder({ index }) {
  return (
    <>
      {/* can be skeletons, loaders, etc. */}
      <li>Loading items {index * CHUNK_SIZE + 1} …</li>
    </>
  );
}

// Async server component for a chunk
async function Chunk({ items, index }) {
  // Optional: simulate staggered streaming
  // await new Promise((r) => setTimeout(r, 50 * index));

  return (
    <>
      {items.map((item, i) => (
        <li key={index * CHUNK_SIZE + i}>{item}</li>
      ))}
    </>
  );
}
