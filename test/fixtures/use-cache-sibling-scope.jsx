import {
  prepareResult,
  getCachedResult,
} from "./use-cache-sibling-scope-data.mjs";

export default async function App() {
  // Call through the non-cached helper (exercises the sibling scope path)
  const prepared = await prepareResult({ id: "foo", score: 21 });

  // Call the cached function directly (exercises the direct-call path)
  const direct = await getCachedResult("direct", 99, "none");

  return (
    <div>
      <div id="prepared-label">{prepared.label}</div>
      <div id="prepared-value">{prepared.value}</div>
      <div id="prepared-extra">{prepared.extra}</div>
      <div id="prepared-timestamp">{prepared.timestamp}</div>
      <div id="direct-label">{direct.label}</div>
      <div id="direct-value">{direct.value}</div>
      <div id="direct-extra">{direct.extra}</div>
      <div id="direct-timestamp">{direct.timestamp}</div>
    </div>
  );
}
