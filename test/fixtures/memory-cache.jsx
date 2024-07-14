import { useSearchParams } from "@lazarv/react-server";
import { useCache } from "@lazarv/react-server/memory-cache";

export default async function MemoryCache() {
  const searchParams = useSearchParams();
  return (
    <>
      {await useCache(
        ["random"],
        () => Math.random(),
        1000,
        "force" in searchParams
      )}
    </>
  );
}
