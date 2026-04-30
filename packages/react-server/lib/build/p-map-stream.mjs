/**
 * Bounded-concurrency consumer of an AsyncIterable.
 *
 * Spawns N parallel "workers" that share a single async iterator. Each
 * worker pulls the next item, runs the mapper, repeats until the iterator
 * is exhausted. There is no internal queue — the iterator itself is the
 * queue. Memory is exactly O(concurrency) retained mapper scopes,
 * regardless of how many items the iterable yields. This is the property
 * Promise.all(map(...)) cannot give: that scheduler instantiates every
 * mapper closure up front, holding their full scopes alive in parallel.
 *
 * Backpressure is automatic: a slow source generator (e.g. paginated DB
 * fetch) is only pulled when a worker is free, so the source never gets
 * ahead of the consumer.
 *
 * Errors thrown by the mapper are fatal: the first error aborts further
 * pulls and rejects the returned promise. If the caller wants per-item
 * error tolerance, they should catch inside the mapper.
 */
export async function pMapStream(asyncIterable, mapper, concurrency) {
  if (concurrency < 1) {
    throw new Error(`pMapStream concurrency must be >= 1, got ${concurrency}`);
  }
  const it = asyncIterable[Symbol.asyncIterator]
    ? asyncIterable[Symbol.asyncIterator]()
    : asyncIterable[Symbol.iterator]();

  let aborted = null;

  // Serialize iterator.next() across workers. Async iterators are not
  // required to be reentrant — calling next() again before the previous
  // call resolves is undefined behavior on some sources. A simple chained
  // promise gate enforces sequential pulls without blocking workers from
  // running their mappers concurrently.
  let nextChain = Promise.resolve();
  const safeNext = () => {
    const p = nextChain.then(() => it.next());
    nextChain = p.then(
      () => undefined,
      () => undefined
    );
    return p;
  };

  const worker = async () => {
    while (!aborted) {
      let step;
      try {
        step = await safeNext();
      } catch (e) {
        aborted = e;
        return;
      }
      if (step.done) return;
      try {
        await mapper(step.value);
      } catch (e) {
        aborted = e;
        return;
      }
    }
  };

  const workers = Array.from({ length: concurrency }, worker);
  await Promise.all(workers);
  if (aborted) throw aborted;
}
