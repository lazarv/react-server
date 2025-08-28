import { status } from "@lazarv/react-server";
import { Link } from "@lazarv/react-server/navigation";

export default function NotFound() {
  status(404);

  return (
    <div className="fixed inset-0 flex flex-col gap-4 items-center justify-center">
      <h1 className="text-4xl font-bold">Not Found</h1>
      <p className="text-lg">The page you are looking for does not exist.</p>
      <Link to="/" root noCache>
        Go back to the home page
      </Link>
    </div>
  );
}
