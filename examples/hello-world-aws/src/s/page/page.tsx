import { Link } from "@lazarv/react-server/navigation";

export default async function SecondPage() {
  return (
    <div>
      <title>Second Page</title>
      <h1 className="text-4xl font-bold tracking-tight">Second Page</h1>
      <img
        src="/static/images/image-placeholder.svg"
        alt="placegolder"
        className="w-24 h-24"
      />
      <p>This is placeholder for a Textblock.</p>
      <Link to="/" className="mt-4 inline-block underline">
        Return home
      </Link>
      {Array.from({ length: 10001 }).map((_, index) => (
        <div key={index} className="content-block">
          <h2 className="text-2xl font-semibold">Content Block {index + 1}</h2>
          <p>This is content block number {index + 1}!</p>
        </div>
      ))}
    </div>
  );
}
