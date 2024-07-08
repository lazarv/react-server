import { useUrl } from "@lazarv/react-server";

export default function HttpUrlPage() {
  const url = useUrl();
  return <p>{url.href}</p>;
}
