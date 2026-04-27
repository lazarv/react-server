/**
 * Adaptive concurrency limiter using Event Loop Utilization (ELU).
 *
 * The limiter dynamically adjusts the maximum number of concurrent requests
 * based on Node.js Event Loop Utilization — a direct measure of how saturated
 * the server's single-threaded event loop is. This is the most reliable signal
 * for a Node.js server because:
 *
 * - Unlike latency-based algorithms (Vegas, Gradient), ELU is unaffected by
 *   workload heterogeneity. Switching from a fast route to a slow route
 *   increases latency naturally but does NOT mean the server is overloaded.
 *   ELU only rises when the event loop itself is saturated.
 *
 * - Unlike CPU%, ELU directly measures event loop busy/idle time, which is
 *   the actual bottleneck for a single-threaded server.
 *
 * The control loop uses AIMD (Additive Increase, Multiplicative Decrease):
 * - **ELU < eluMax**: increase limit by sqrt(limit) per window (fast recovery)
 * - **ELU ≥ eluMax**: decrease limit by 10% per window (gentle backoff)
 *
 * The limiter starts wide open (initialLimit = maxLimit) and should be
 * invisible under normal load. It only tightens when the event loop is
 * genuinely saturated.
 *
 * When a request cannot be immediately admitted, it is placed in a bounded FIFO
 * queue with a per-request timeout. Slots are released to queued waiters before
 * becoming available for new `acquire()` calls, ensuring fair ordering.
 *
 * @module
 */

import { performance } from "node:perf_hooks";

/**
 * @typedef {Object} AdaptiveLimiterConfig
 * @property {number}  [initialLimit=1000]   Starting concurrency limit (defaults to maxLimit — start wide open)
 * @property {number}  [minLimit=1]          Floor for the adaptive limit
 * @property {number}  [maxLimit=1000]       Ceiling for the adaptive limit
 * @property {number}  [eluMax=0.95]         ELU level that triggers limit decrease and queue skip (0–1)
 * @property {number}  [sampleWindow=1000]   Interval (ms) for recalculation and ELU sampling
 * @property {number}  [smoothingFactor=0.2] EWMA factor for `smoothedLatency` in stats (observability only — not used in the control loop)
 * @property {number}  [queueSize=100]       Max requests waiting in the backpressure queue
 * @property {number}  [queueTimeout=5000]   Max time (ms) a request waits in the queue before 503
 * @property {{ info?: Function, warn?: Function }} [logger] Optional logger; transitions (limit shrink/recover, queue saturation, 503 firing) are reported here.
 */

/**
 * Create an adaptive concurrency limiter.
 *
 * @param {AdaptiveLimiterConfig} [config]
 */
export function createAdaptiveLimiter(config = {}) {
  const {
    minLimit = 1,
    maxLimit = 1000,
    initialLimit = maxLimit,
    eluMax = 0.95,
    sampleWindow = 1000,
    smoothingFactor = 0.2,
    queueSize = 100,
    queueTimeout = 5000,
    logger = null,
  } = config;

  // Counters for the optional periodic log line — reset every recalc tick.
  let rejected503 = 0;
  let queuedTotal = 0;

  // ── Limiter state ──
  let limit = Math.max(minLimit, Math.min(maxLimit, initialLimit));
  let inflight = 0;
  let sampleCount = 0;

  // ── Latency tracking (for observability, not used in control loop) ──
  let smoothedLatency = 0;

  // ── ELU state ──
  let prevELU = performance.eventLoopUtilization();
  let currentELU = 0;

  // ── Wait queue (bounded FIFO) ──
  // Each entry: { resolve, timer, abortHandler, signal }
  // resolve(true)  = slot acquired, proceed
  // resolve(false) = timed out or destroyed, reject with 503
  /** @type {{ resolve: (v: boolean) => void, timer: ReturnType<typeof setTimeout>, abortHandler: (() => void) | null, signal: AbortSignal | null }[]} */
  const waitQueue = [];

  /**
   * Try to hand a slot to the next queued waiter.
   *
   * Critically, this respects the current adaptive limit: if inflight >= limit
   * after the release, we do NOT wake a waiter. This lets the server drain back
   * to the computed limit under overload. Without this check, drainOne() would
   * defeat the adaptive algorithm by keeping inflight permanently above the
   * limit — every finished request would immediately be replaced.
   *
   * Skipped entries (aborted clients) are cleaned up without consuming a slot.
   */
  function drainOne() {
    while (waitQueue.length > 0) {
      // Respect the adaptive limit — let inflight drain before admitting more
      if (inflight >= limit) {
        return false;
      }
      const waiter = waitQueue.shift();
      clearTimeout(waiter.timer);
      if (waiter.signal) {
        waiter.signal.removeEventListener("abort", waiter.abortHandler);
      }
      // Client already disconnected — skip without consuming a slot
      if (waiter.signal?.aborted) {
        continue;
      }
      inflight++;
      waiter.resolve(true);
      return true;
    }
    return false;
  }

  // ── Periodic recalculation (AIMD based on ELU) ──
  const recalcInterval = setInterval(() => {
    // Sample ELU over the last window. The `prev` argument must be a
    // cumulative snapshot, NOT a delta: Node computes `current - prev`
    // and a diff object's idle/active fields aren't cumulative values.
    // So we call `eventLoopUtilization()` again with no args to capture
    // a fresh cumulative baseline for the next window. The few ns gap
    // between the two calls is unobservable.
    const nowELU = performance.eventLoopUtilization(prevELU);
    currentELU = nowELU.utilization;
    prevELU = performance.eventLoopUtilization();

    const prevLimit = limit;

    if (currentELU >= eluMax) {
      // ── Decrease: multiplicative (gentle 10% backoff) ──
      // Only shrink when we're actually at capacity. If inflight is well
      // below the limit, the high ELU is transient (GC, etc.), not sustained.
      if (inflight >= limit * 0.5) {
        limit = Math.max(minLimit, Math.floor(limit * 0.9));
      }
    } else {
      // ── Increase: additive (sqrt scaling for proportional exploration) ──
      // No dead zone — always recover toward maxLimit unless overloaded.
      // The limiter starts wide open and should stay wide open under normal load.
      limit = Math.min(
        maxLimit,
        limit + Math.max(1, Math.ceil(Math.sqrt(limit)))
      );
    }

    // Wake queued waiters if limit grew
    if (limit > prevLimit) {
      while (inflight < limit && waitQueue.length > 0) {
        if (!drainOne()) break;
      }
    }

    // ── Operator-visible transitions ──
    // We log only when something changes — silent under steady-state.
    if (logger) {
      if (limit < prevLimit) {
        logger.warn?.(
          `[adaptive-limiter] limit ${prevLimit} → ${limit} (ELU=${currentELU.toFixed(2)}, inflight=${inflight}, queued=${waitQueue.length})`
        );
      } else if (limit > prevLimit && prevLimit < maxLimit) {
        logger.info?.(
          `[adaptive-limiter] limit ${prevLimit} → ${limit} (recovering)`
        );
      }
      if (rejected503 > 0 || queuedTotal > 0) {
        logger.warn?.(
          `[adaptive-limiter] window: ${rejected503} rejected, ${queuedTotal} queued, queue depth ${waitQueue.length}/${queueSize}`
        );
      }
    }
    rejected503 = 0;
    queuedTotal = 0;

    // Reset sample count for next window
    sampleCount = 0;
  }, sampleWindow);

  // Don't keep the process alive just for this timer
  recalcInterval.unref();

  return {
    /**
     * Try to acquire a slot, optionally waiting in a bounded queue.
     *
     * @param {AbortSignal} [signal] - Client connection abort signal. When the
     *   client disconnects while queued, the waiter is removed automatically.
     * @returns {boolean | Promise<boolean>} `true` if the request may proceed,
     *   `false` if rejected. Returns a plain boolean for the fast path (no
     *   Promise overhead), a Promise only when the request is queued.
     *
     * Resolution paths:
     * - Slot available (inflight < limit) → returns `true` (sync, no Promise)
     * - At limit + ELU > eluMax → returns `false` (sync, no Promise)
     * - At limit + queue full → returns `false` (sync, no Promise)
     * - Queued → returns Promise that resolves `true`/`false` on slot/timeout/abort
     */
    acquire(signal) {
      // Fast path: a slot is available AND no one is already waiting.
      // The `waitQueue.length === 0` guard preserves FIFO fairness — if
      // there are queued waiters, a new arrival must not jump ahead even
      // if `inflight < limit` (this can happen briefly between a recalc
      // tick growing the limit and `drainOne` running through the queue).
      // Returns a plain boolean (not a Promise) to avoid microtask overhead
      // on the hot path. At 50k req/s, every microtask yield matters.
      if (inflight < limit && waitQueue.length === 0) {
        inflight++;
        return true;
      }

      // Hard ELU ceiling: don't queue when the event loop is saturated.
      // Note: `currentELU` only refreshes once per `sampleWindow`, so this
      // signal lags by up to that many ms. The primary gate is still the
      // limit itself; this check only prevents piling work onto the queue
      // when we already know the loop is saturated.
      if (currentELU > eluMax) {
        rejected503++;
        return false;
      }

      // Queue full: reject immediately
      if (waitQueue.length >= queueSize) {
        rejected503++;
        return false;
      }

      // ── Enqueue with timeout ──
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          // Remove from queue on timeout
          const idx = waitQueue.indexOf(entry);
          if (idx !== -1) waitQueue.splice(idx, 1);
          if (signal) {
            signal.removeEventListener("abort", abortHandler);
          }
          resolve(false);
        }, queueTimeout);
        timer.unref();

        // Client disconnect handler
        let abortHandler = null;
        if (signal) {
          abortHandler = () => {
            clearTimeout(timer);
            const idx = waitQueue.indexOf(entry);
            if (idx !== -1) waitQueue.splice(idx, 1);
            resolve(false);
          };
          signal.addEventListener("abort", abortHandler, { once: true });
        }

        const entry = { resolve, timer, abortHandler, signal: signal ?? null };
        waitQueue.push(entry);
        queuedTotal++;
      });
    },

    /**
     * Release a slot after the response is fully sent.
     * If waiters are queued, the slot is handed to the next waiter (FIFO)
     * rather than returned to the pool.
     *
     * @param {number} latencyMs - Request duration in milliseconds
     */
    release(latencyMs) {
      inflight = Math.max(0, inflight - 1);

      if (latencyMs > 0) {
        // EWMA latency tracking (for observability only)
        smoothedLatency =
          smoothedLatency === 0
            ? latencyMs
            : smoothedLatency * (1 - smoothingFactor) +
              latencyMs * smoothingFactor;
        sampleCount++;
      }

      // Wake next queued waiter (if any)
      drainOne();
    },

    /**
     * Release without latency tracking. Used by the admission-control
     * middleware on the steady-state happy path (no queueing happened),
     * where the caller would otherwise pay `performance.now()` × 2 to
     * compute latency that's never observed in steady-state. Latency
     * stats remain populated by the contended `release(latencyMs)` path,
     * which is where latency-based diagnostics actually matter.
     */
    releaseFast() {
      inflight = Math.max(0, inflight - 1);
      drainOne();
    },

    /**
     * Observability snapshot. Safe to serialize to JSON for metrics/logging.
     */
    get stats() {
      return {
        limit,
        inflight,
        queued: waitQueue.length,
        smoothedLatency,
        elu: currentELU,
        sampleCount,
      };
    },

    /**
     * Clean up the periodic interval and reject all queued waiters.
     * Call this on server shutdown.
     */
    destroy() {
      clearInterval(recalcInterval);
      // Drain all waiters with rejection
      while (waitQueue.length > 0) {
        const waiter = waitQueue.shift();
        clearTimeout(waiter.timer);
        if (waiter.signal) {
          waiter.signal.removeEventListener("abort", waiter.abortHandler);
        }
        waiter.resolve(false);
      }
    },
  };
}
