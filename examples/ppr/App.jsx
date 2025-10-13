import { Suspense } from "react";
import Counter from "./Counter";

function Time() {
  return <time>{new Date().toLocaleTimeString()}</time>;
}

function CachedTime() {
  "use static";
  return <Time />;
}

async function Main() {
  "use dynamic";
  await new Promise((resolve) => setTimeout(resolve, 50));
  return (
    <div
      style={{
        border: "1px solid #ccc",
        padding: "10px",
        marginTop: "10px",
        marginBottom: "10px",
      }}
    >
      <h2>Main Content (On-Demand)</h2>
      <p>
        This part of the page is rendered on-demand at <Time />.
      </p>

      <pre>{Math.random()}</pre>
      <Counter />
    </div>
  );
}

export default async function App() {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <h1>Partial Pre-Rendering</h1>
        <p>
          This page demonstrates Partial Pre-Rendering (PPR) with React Server.
          The header and footer are pre-rendered, while the main content is
          rendered on-demand.
        </p>
        <header style={{ backgroundColor: "#f0f0f0", padding: "10px" }}>
          <h2>
            Header (Pre-Rendered at <CachedTime />)
          </h2>
        </header>
        <main style={{ padding: "10px" }}>
          <Suspense fallback={<p>Loading main content...</p>}>
            <Main />
          </Suspense>
          <Counter
            action={async (count) => {
              "use server";
              console.log("Server Function called with count:", count);
            }}
          />
        </main>
        <footer style={{ backgroundColor: "#f0f0f0", padding: "10px" }}>
          <h2>
            Footer (Pre-Rendered at <CachedTime />)
          </h2>
        </footer>
      </body>
    </html>
  );
}
