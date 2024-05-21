import { status } from "@lazarv/react-server";

export default function NotFound() {
  status(404);
  return <>404 Not Found</>;
}
