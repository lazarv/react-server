import { getNoHydrateData } from "./use-cache-request-data.mjs";
import NoHydrateClient from "./use-cache-request-no-hydrate-client.jsx";

async function ServerDisplay() {
  const data = await getNoHydrateData();
  return (
    <>
      <div id="server-timestamp">{data.timestamp}</div>
      <div id="server-random">{data.random}</div>
      <div id="server-type">
        {data.createdAt instanceof Date ? "Date" : typeof data.createdAt}
      </div>
    </>
  );
}

export default async function App() {
  return (
    <div>
      <ServerDisplay />
      <NoHydrateClient />
    </div>
  );
}
