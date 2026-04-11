export default function VirtualPage() {
  return (
    <div>
      <h1>Virtual Route Page</h1>
      <p>
        This page is defined via a virtual route in the config, not discovered
        from the filesystem. The source file lives outside the{" "}
        <code>pages/</code> directory.
      </p>
      <p>
        <a href="/">← Back to home</a>
      </p>
    </div>
  );
}
