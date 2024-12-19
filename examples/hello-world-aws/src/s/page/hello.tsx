import { headers } from "@lazarv/react-server";
import { Link } from "@lazarv/react-server/navigation";

export default async function HelloPage() {
  headers({
    "cache-control": "s-maxage=1,must-revalidate",
  });

  return (
    <div>
      <title>Hello 01</title>
      <h1 className="text-4xl font-bold tracking-tight">
        s/page/Hello (dynamic)
      </h1>
      <img
        src="/static/images/image-placeholder.svg"
        alt="placeholder"
        className="w-full max-w-full h-auto"
      />
      <p>This is placeholder for a Textblock. {new Date().toISOString()}</p>
      <Link to="/" className="mt-4 inline-block underline">
        Return home
      </Link>
      <Link to="/s/hello" className="mt-4 inline-block underline">
        Hello (static)
      </Link>
      <Link to="/s/page/hello" className="mt-4 inline-block underline">
        Hello (dynamic)
      </Link>
    </div>
  );
}
