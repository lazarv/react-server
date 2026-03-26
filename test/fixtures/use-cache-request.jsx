import { getRequestData } from "./use-cache-request-data.mjs";
import ClientDisplay from "./use-cache-request-client.jsx";

async function First() {
  const data = await getRequestData();
  return (
    <>
      <div id="first">{JSON.stringify(data)}</div>
      <div id="first-timestamp">{data.timestamp}</div>
      <div id="first-random">{data.random}</div>
      <div id="first-type">
        {data.createdAt instanceof Date ? "Date" : typeof data.createdAt}
      </div>
    </>
  );
}

async function Second() {
  const data = await getRequestData();
  return (
    <>
      <div id="second">{JSON.stringify(data)}</div>
      <div id="second-type">
        {data.createdAt instanceof Date ? "Date" : typeof data.createdAt}
      </div>
    </>
  );
}

export default async function App() {
  return (
    <div>
      <First />
      <Second />
      <ClientDisplay />
    </div>
  );
}
