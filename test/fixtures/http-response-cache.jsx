import { headers, revalidate, useResponseCache } from "@lazarv/react-server";

export default function ResponseCache() {
  useResponseCache(1000);

  const headerList = headers();
  if (headerList.has("x-revalidate")) {
    revalidate();
  }

  return <>{Math.random()}</>;
}
