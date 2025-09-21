import { status } from "@lazarv/react-server";

import ServerForm from "./ServerForm.jsx";
import ClientForm from "./ClientForm.jsx";

export function init$() {
  return async ({ request }) => {
    if (request.headers.get("content-length") > 1000) {
      status(413);
      throw new Error("Payload Too Large");
    }
  };
}

export default function App() {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <h1>File Upload</h1>
        <div style={{ padding: 20, border: "1px dashed blue" }}>
          <h2>Server Form</h2>
          <ServerForm />
        </div>
        <div style={{ padding: 20, border: "1px dashed red", marginTop: 20 }}>
          <h2>Client Form</h2>
          <ClientForm />
        </div>
      </body>
    </html>
  );
}
