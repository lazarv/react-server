import { Link } from "@lazarv/react-server/navigation";

export default async function AboutPage() {
  return (
    <div>
      <title>About 01</title>
      <h1 className="text-4xl font-bold tracking-tight">About (static)</h1>
      <img
        src="/static/images/image-placeholder.svg"
        alt="placeholder"
        className="w-full max-w-full h-auto"
      />
      <p>This is placeholder for a Textblock.</p>
      <Link to="/" className="mt-4 inline-block underline">
        Return home
      </Link>
      |{" "}
      <Link to="/s/page" className="mt-4 inline-block underline">
        Page (static/no preload)
      </Link>
      |{" "}
      <Link to="/s/hello" className="mt-4 inline-block underline">
        Hello (static)
      </Link>
      |{" "}
      <Link to="/s/page/hello" className="mt-4 inline-block underline">
        Hello (dynamic)
      </Link>
    </div>
  );
}
