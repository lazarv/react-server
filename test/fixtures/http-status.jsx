import { status } from "@lazarv/react-server";

export default function HttpStatusPage() {
  status(404);
  return <p>Not Found</p>;
}
