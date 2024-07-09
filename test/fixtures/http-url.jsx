import { useUrl } from "@lazarv/react-server";

export default function HttpUrlPage() {
  const { origin, searchParams } = useUrl();
  return (
    <>
      <pre>{JSON.stringify(Object.fromEntries(searchParams))}</pre>
      <p>{origin}</p>
    </>
  );
}
