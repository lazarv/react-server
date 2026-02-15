async function ThrowError() {
  throw new Error("sourcemap-test-error");
}

export default function SourcemapFixture() {
  return (
    <html lang="en">
      <body>
        <h1>Sourcemap Test</h1>
        <ThrowError />
      </body>
    </html>
  );
}
