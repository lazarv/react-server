import { appendHeader } from "@lazarv/react-server";

export default function HttpHeadersPage() {
  appendHeader("x-custom-header", "custom-value");
  appendHeader("x-custom-header", "another-value");
  appendHeader("cache-control", "max-age=10");
  return <p>Custom headers</p>;
}
