import { headers } from "@lazarv/react-server";

export default function HttpHeadersPage() {
  headers({
    "x-custom-header": "custom-value",
    "x-another-header": "another-value",
  });
  return <p>Headers</p>;
}
