import { Link } from "@lazarv/react-server/navigation";

export default async function AboutPage() {
  return (
    <div>
      <title>About 01</title>
      <h1 className="text-4xl font-bold tracking-tight">About</h1>
      <img
        src="/static/images/image-placeholder.svg"
        alt="placeholder"
        className="w-24 h-24"
      />
      <p>This is placeholder for a Textblock.</p>
      <Link to="/" className="mt-4 inline-block underline">
        Return home
      </Link>
    </div>
  );
}
