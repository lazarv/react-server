import ThreeScene from "./ThreeScene";

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>React Three Fiber + React Server</title>
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { background: #111; color: #fff; font-family: sans-serif; }
          .container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            gap: 1rem;
          }
          h1 { font-size: 1.5rem; opacity: 0.8; }
          p { font-size: 0.9rem; opacity: 0.5; }
        `}</style>
      </head>
      <body>
        <div className="container">
          <h1>React Three Fiber + @lazarv/react-server</h1>
          <ThreeScene />
          <p>
            A rotating cube rendered with @react-three/fiber inside a React
            Server Component tree.
          </p>
        </div>
      </body>
    </html>
  );
}
