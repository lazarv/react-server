export default function ServerPage() {
  const timestamp = new Date().toLocaleTimeString();

  return (
    <div>
      <h1>Server Page (Server Component)</h1>
      <p>
        This page is a server component. Navigation here always hits the server.
      </p>
      <p>
        Server timestamp: <strong>{timestamp}</strong>
      </p>
      <p style={{ color: "gray", fontSize: "0.85rem" }}>
        Each navigation to this page shows a fresh server timestamp.
      </p>
    </div>
  );
}
