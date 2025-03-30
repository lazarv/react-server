import Remote from "http://[::1]:3001" with { type: "remote" };
import Static from "http://localhost:3002" with { type: "remote" };
import Streaming from "http://localhost:3003" with { type: "remote" };

import HostButton from "./HostButton.jsx";

export default function App() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Remote</title>
      </head>
      <body suppressHydrationWarning>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              margin: 16,
              padding: 16,
              border: "dashed 2px #000",
            }}
          >
            <h1>Host</h1>
            <HostButton />
          </div>
          <div
            style={{
              margin: 16,
              padding: 16,
              border: "dashed 2px #f00",
            }}
          >
            <h2>Remote</h2>
            <Remote ttl={0} />
          </div>
          <div
            style={{
              margin: 16,
              padding: 16,
              border: "dashed 2px #0a0",
            }}
          >
            <h2>Static</h2>
            <Static ttl={0} />
          </div>
          <div
            style={{
              margin: 16,
              padding: 16,
              border: "dashed 2px #00f",
            }}
          >
            <h2>Streaming</h2>
            <Streaming ttl={0} defer />
          </div>
        </div>
      </body>
    </html>
  );
}
