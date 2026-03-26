import { Suspense } from "react";
import { getRequestData, getSuspenseData } from "./use-cache-request-data.mjs";
import ClientDisplay from "./use-cache-request-client.jsx";
import SuspenseClientDisplay from "./use-cache-request-suspense-client.jsx";

async function Eager() {
  const data = await getRequestData();
  return (
    <>
      <div id="eager-timestamp">{data.timestamp}</div>
      <div id="eager-random">{data.random}</div>
    </>
  );
}

async function Delayed() {
  const data = await getSuspenseData();
  return (
    <>
      <div id="delayed-timestamp">{data.timestamp}</div>
      <div id="delayed-random">{data.random}</div>
      <SuspenseClientDisplay />
    </>
  );
}

export default async function App() {
  return (
    <div>
      <Eager />
      <ClientDisplay />
      <Suspense fallback={<div id="suspense-fallback">Loading...</div>}>
        <Delayed />
      </Suspense>
    </div>
  );
}
