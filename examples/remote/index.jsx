import { RemoteComponent } from "@lazarv/react-server/router";

import HostButton from "./HostButton.jsx";

export default function Remote() {
  return (
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
        <RemoteComponent src="http://[::1]:3001" ttl={0} />
      </div>
      <div
        style={{
          margin: 16,
          padding: 16,
          border: "dashed 2px #0a0",
        }}
      >
        <h2>Static</h2>
        <RemoteComponent src="http://localhost:3002" />
      </div>
      <div
        style={{
          margin: 16,
          padding: 16,
          border: "dashed 2px #00f",
        }}
      >
        <h2>Streaming</h2>
        <RemoteComponent src="http://localhost:3003" ttl={0} defer />
      </div>
    </div>
  );
}
