import { setHeader } from "@lazarv/react-server";

export default function HttpHeadersPage() {
  setHeader("x-custom-header", "custom-value");
  setHeader("x-custom-header", "another-value");
  setHeader("cache-control", "max-age=10");
  return <p>Custom headers</p>;
}
