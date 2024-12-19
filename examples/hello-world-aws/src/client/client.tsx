import { Link } from "@lazarv/react-server/navigation";

export default async function ClientPage() {
  return (
    <div>
      <title>ClientPage</title>
      <h1 className="text-4xl font-bold tracking-tight">
        ClientPage (dynamic)
      </h1>

      <p>Overlaps with static content.</p>
      <Link to="/" className="mt-4 inline-block underline">
        Return home
      </Link>
    </div>
  );
}
