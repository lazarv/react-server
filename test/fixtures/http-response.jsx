import { Suspense } from "react";
import { useResponse, setHeader } from "@lazarv/react-server";

async function Response() {
  const res = await useResponse();
  console.log("x-custom", res.headers.get("x-custom"));
  return <div>HTTP Response</div>;
}

export default function App() {
  setHeader("x-custom", "custom-value");
  return (
    <html lang="en">
      <body>
        <Suspense fallback={<div>Loading...</div>}>
          <Response />
        </Suspense>
      </body>
    </html>
  );
}
