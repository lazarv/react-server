"use worker";

// ---------- CPU-intensive Fibonacci (BigInt for precision) ----------

export async function fibonacci(n) {
  const start = performance.now();
  let a = 0n;
  let b = 1n;
  for (let i = 0; i < n; i++) {
    const temp = b;
    b = a + b;
    a = temp;
  }
  const duration = performance.now() - start;
  const str = a.toString();
  return {
    n,
    result:
      str.length > 40 ? str.slice(0, 20) + "\u2026" + str.slice(-20) : str,
    digits: str.length,
    duration: duration.toFixed(2),
  };
}

// ---------- Sort Benchmark ----------

export async function sortBenchmark(size) {
  const start = performance.now();
  const arr = Float64Array.from({ length: size }, () => Math.random());
  arr.sort();
  const duration = performance.now() - start;
  return {
    size: size.toLocaleString(),
    duration: duration.toFixed(2),
    min: arr[0].toFixed(8),
    median: arr[Math.floor(arr.length / 2)].toFixed(8),
    max: arr[arr.length - 1].toFixed(8),
  };
}

// ---------- Deferred Promise (consumed via React use() hook) ----------

export async function analyzeDataset() {
  return {
    status: "processing",
    data: new Promise((resolve) => {
      setTimeout(() => {
        const values = Array.from({ length: 10000 }, () => Math.random() * 100);
        const mean = values.reduce((a, b) => a + b) / values.length;
        const sorted = values.toSorted((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        const variance =
          values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
        resolve({
          samples: values.length,
          mean: mean.toFixed(2),
          median: median.toFixed(2),
          stddev: Math.sqrt(variance).toFixed(2),
          min: sorted[0].toFixed(2),
          max: sorted[sorted.length - 1].toFixed(2),
        });
      }, 2000);
    }),
  };
}

// ---------- Streaming Computation Results ----------

let taskId = 0;
export async function streamComputations() {
  const id = ++taskId;
  const operations = [
    "Generating random matrix",
    "Computing dot product",
    "Applying transformation",
    "Normalizing vectors",
    "Calculating eigenvalues",
    "Running optimization pass",
    "Validating convergence",
    "Finalizing results",
  ];

  return new ReadableStream({
    async start(controller) {
      for (let i = 0; i < operations.length; i++) {
        const result = Array.from({ length: 50000 }, () =>
          Math.random()
        ).reduce((a, b) => a + b, 0);
        controller.enqueue(
          JSON.stringify({
            task: id,
            step: i + 1,
            total: operations.length,
            operation: operations[i],
            result: result.toFixed(2),
            time: new Date().toISOString(),
          }) + "\n"
        );
        await new Promise((r) => setTimeout(r, 350));
      }
      controller.close();
    },
  });
}
