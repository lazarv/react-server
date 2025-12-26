import { useSearchParams } from "@lazarv/react-server";

function getTime({ id: _ }) {
  "use cache";
  return new Date().toISOString();
}

export default async function App() {
  const { id } = useSearchParams();
  return <div>{getTime({ id })}</div>;
}
