import Counter from "./Counter.jsx";

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>React Compiler · @lazarv/react-server</title>
        <style>{`
          body { font: 16px/1.5 system-ui, sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; }
          button { font: inherit; padding: .4rem .8rem; margin-right: .5rem; cursor: pointer; }
          code { background: #f3f3f3; padding: 0 .2rem; border-radius: 2px; }
          .pill { display: inline-block; padding: 0 .5rem; border-radius: 999px; background: #eef; font-size: .85em; }
        `}</style>
      </head>
      <body>
        <main>
          <h1>React Compiler example</h1>
          <p>
            This page is rendered as a{" "}
            <span className="pill">Server Component</span>. The interactive
            widget below is a <span className="pill">Client Component</span>{" "}
            whose render output is automatically memoized by{" "}
            <a href="https://react.dev/learn/react-compiler">React Compiler</a>.
          </p>
          <p>
            Open the browser devtools React profiler — clicking{" "}
            <code>re-render parent</code> does not re-run the expensive
            computation, even though no <code>useMemo</code> was written by
            hand.
          </p>
          <Counter />
        </main>
      </body>
    </html>
  );
}
