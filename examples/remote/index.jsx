import Remote from "http://[::1]:3001" with { type: "remote" };
import Static from "http://localhost:3002" with { type: "remote" };
import Streaming from "http://localhost:3003" with { type: "remote" };
import Live from "http://localhost:3004" with { type: "remote" };
import Navigation from "http://localhost:3005" with { type: "remote" };
import Form from "http://localhost:3006" with { type: "remote" };
import Context from "http://localhost:3007" with { type: "remote" };

import HostButton from "./HostButton.jsx";
import DataProvider from "./HostProvider.jsx";

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
            <h2>Server Function</h2>
            <Remote ttl={0} isolate initialName="Remote User">
              <HostButton />
              <div
                style={{
                  padding: 16,
                  marginTop: 16,
                  border: "dashed 2px #faa",
                }}
              >
                <i>Remote Component content</i>
              </div>
            </Remote>
          </div>
          <div
            style={{
              margin: 16,
              padding: 16,
              border: "dashed 2px #0a0",
            }}
          >
            <h2>Static</h2>
            <Static ttl={0} isolate>
              <div style={{ padding: 16, border: "dashed 2px #0aa" }}>
                <i>Remote Component content</i>
              </div>
            </Static>
          </div>
          <div
            style={{
              margin: 16,
              padding: 16,
              border: "dashed 2px #00f",
            }}
          >
            <h2>Streaming</h2>
            <Streaming
              ttl={0}
              defer
              isolate
              message="Remote Component is loading..."
            >
              <div
                style={{
                  padding: 16,
                  marginTop: 16,
                  border: "dashed 2px #0af",
                }}
              >
                <i>Remote Component content</i>
              </div>
            </Streaming>
          </div>
          <div
            style={{
              margin: 16,
              padding: 16,
              border: "dashed 2px #f0f",
            }}
          >
            <h2>Live</h2>
            <Live isolate ttl={0}>
              <div
                style={{
                  padding: 16,
                  marginTop: 16,
                  border: "dashed 2px #a0a",
                }}
              >
                <i>Remote Component content</i>
              </div>
            </Live>
          </div>
          <div
            style={{
              margin: 16,
              padding: 16,
              border: "dashed 2px #aa0",
            }}
          >
            <h2>Navigation</h2>
            <Navigation isolate message="This is the navigation example.">
              <div
                style={{
                  padding: 16,
                  marginBottom: 16,
                  border: "dashed 2px #fa0",
                }}
              >
                <i>Remote Component content</i>
              </div>
            </Navigation>
          </div>
          <div
            style={{
              margin: 16,
              padding: 16,
              border: "dashed 2px #0fa",
            }}
          >
            <h2>Form</h2>
            <Form isolate initialName="Anonymous">
              <div
                style={{
                  padding: 16,
                  marginTop: 16,
                  border: "dashed 2px #0af",
                }}
              >
                <i>Remote Component content</i>
              </div>
            </Form>
          </div>
          <div
            style={{
              margin: 16,
              padding: 16,
              border: "dashed 2px #aaa",
            }}
          >
            <h2>Context</h2>
            <DataProvider data={{ message: <b>This is a context example.</b> }}>
              <Context isolate>
                <div
                  style={{
                    padding: 16,
                    marginTop: 16,
                    border: "dashed 2px #aaa",
                  }}
                >
                  <i>Remote Component content</i>
                </div>
              </Context>
            </DataProvider>
          </div>
        </div>
      </body>
    </html>
  );
}
