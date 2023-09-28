import { Refresh } from "@lazarv/react-server/navigation";

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>@lazarv/react-server</title>
      </head>
      <body>
        Hello World!
        <Refresh>
          <button>REFRESH</button>
        </Refresh>
        {((Math.random() * 10000) | 0) / 10000}
      </body>
    </html>
  );
}
