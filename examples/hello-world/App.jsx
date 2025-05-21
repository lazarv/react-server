import { useResponseCache } from "@lazarv/react-server";

export default function App() {
  useResponseCache(30000);
  return <h1>Hello World</h1>;
}
