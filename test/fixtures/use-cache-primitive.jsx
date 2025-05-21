import { invalidate, useSearchParams } from "@lazarv/react-server";

function getTime() {
  "use cache; profile=frequent";
  return new Date().toISOString();
}

export default async function App() {
  const { force } = useSearchParams();

  if (typeof force !== "undefined") {
    await invalidate(getTime);
  }

  return <div>{getTime()}</div>;
}
