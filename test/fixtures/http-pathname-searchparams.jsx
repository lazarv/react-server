import { usePathname, useSearchParams } from "@lazarv/react-server";

export default function HttpUrlPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (
    <>
      <pre>{JSON.stringify(searchParams)}</pre>
      <p>{pathname}</p>
    </>
  );
}
