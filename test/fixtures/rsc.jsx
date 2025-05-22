import {
  toBuffer,
  fromBuffer,
  toStream,
  fromStream,
} from "@lazarv/react-server/rsc";
import Counter from "./counter";

async function CachedCounter() {
  "use cache: rsc; ttl=5000";
  return <Counter initialCount={Math.floor(Math.random() * 100) + 1} />;
}

export default async function App() {
  const Component = (
    <>
      <h1>Hello World</h1>
      <Counter />
    </>
  );
  const serialized = await toBuffer(Component);
  const deserialized = await fromBuffer(serialized);

  const serializedValue = await toStream("Hello from stream!");
  const deserializedValue = await fromStream(serializedValue);

  const CachedComponent = <CachedCounter />;

  const decoder = new TextDecoder();
  return (
    <>
      <div id="deserialized">{deserialized}</div>
      <pre id="serialized">{decoder.decode(serialized)}</pre>
      <div id="deserialized-stream">{deserializedValue}</div>
      {CachedComponent}
    </>
  );
}
