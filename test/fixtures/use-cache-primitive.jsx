import { invalidate, useSearchParams } from "@lazarv/react-server";

function getTime() {
  "use cache; profile=frequent";
  return new Date().toISOString();
}

export default async function App() {
  const { force } = useSearchParams();

  if (typeof force !== "undefined") {
    invalidate(getTime);
  }

  return <div>{getTime()}</div>;
}
