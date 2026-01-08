import StreamingList from "../StreamingList.jsx";
export default function IndexPage() {
  return (
    <main>
      <h1>Minimal React Server App</h1>
      <p>Rendered via AWS Lambda integration test.</p>
      <StreamingList chunkSize={200} />
    </main>
  );
}
