async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function SlowPage() {
  // Simulate a slow data fetch
  await delay(3000);

  const timestamp = new Date().toLocaleTimeString();

  return (
    <div>
      <h1>Slow Page (Server Component)</h1>
      <p>This page took 3 seconds to load on the server.</p>
      <p>
        Server timestamp: <strong>{timestamp}</strong>
      </p>
      <p style={{ color: "gray", fontSize: "0.85rem" }}>
        The skeleton loading indicator was shown instantly while this page was
        being rendered on the server.
      </p>
    </div>
  );
}
