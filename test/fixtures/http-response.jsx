import { Suspense } from "react";
import { useResponse, setHeader } from "@lazarv/react-server";

async function Response() {
  await new Promise((resolve) => setTimeout(resolve, 200));
  const res = useResponse();
  console.log("x-custom", res.headers.get("x-custom"));
  return <div>HTTP Response</div>;
}

export default function App() {
  setHeader("x-custom", "custom-value");
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Response />
    </Suspense>
  );
}
