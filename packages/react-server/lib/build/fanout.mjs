import { once } from "node:events";

/**
 * Pump a Web ReadableStream into multiple Node.js Writable streams with
 * synchronized backpressure.
 *
 * Memory profile per call: one chunk in flight × number of sinks. We do
 * NOT use ReadableStream.tee() because tee buffers the gap between the
 * fastest and slowest consumer — and brotli is 5–10× slower than a raw
 * file write, which means tee accumulates the entire HTML body in memory
 * for any non-trivial page. fanout reads one chunk, pushes it to every
 * sink, waits for *all* sinks to accept it (honoring backpressure on each
 * Writable), then reads the next chunk. Predictable, bounded memory.
 *
 * Backpressure: writeWithBackpressure only resolves when the sink has
 * either accepted the chunk synchronously or emitted "drain" after a
 * full buffer. The slowest sink dictates the read cadence — exactly what
 * we want.
 */
export async function fanout(webStream, sinks) {
  if (!webStream) {
    // Nothing to pump (e.g. response had no body). Still close sinks
    // cleanly so the pipeline ends.
    await Promise.all(sinks.map(endSink));
    return;
  }

  const reader = webStream.getReader();
  let pumpError = null;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // Normalize Uint8Array → Buffer once. Node Writables accept both,
      // but Buffer is what gzip/brotli streams expect natively, and
      // sharing one Buffer across sinks avoids per-sink allocation.
      const chunk =
        Buffer.isBuffer(value) || typeof value === "string"
          ? value
          : Buffer.from(value.buffer, value.byteOffset, value.byteLength);
      await Promise.all(sinks.map((s) => writeWithBackpressure(s, chunk)));
    }
  } catch (e) {
    pumpError = e;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // releaseLock can throw if the stream is in a weird state; the
      // pump error (if any) is what matters.
    }
  }

  // End every sink, even on error. Letting them dangle would leak file
  // descriptors. If the pump failed we still want to close the sinks
  // (with destroy semantics) before propagating the error.
  if (pumpError) {
    for (const s of sinks) {
      try {
        s.destroy(pumpError);
      } catch {
        /* noop */
      }
    }
    throw pumpError;
  }

  await Promise.all(sinks.map(endSink));
}

function writeWithBackpressure(stream, chunk) {
  if (stream.write(chunk)) return Promise.resolve();
  return once(stream, "drain");
}

function endSink(stream) {
  return new Promise((resolve, reject) => {
    if (stream.writableEnded || stream.destroyed) {
      resolve();
      return;
    }
    stream.end((err) => (err ? reject(err) : resolve()));
  });
}
