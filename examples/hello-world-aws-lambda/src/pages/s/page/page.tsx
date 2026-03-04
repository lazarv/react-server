import { Link } from "@lazarv/react-server/navigation";

import StreamingList from "../../../components/StreamingList";

export default async function SecondPage() {
  return (
    <div>
      <title>Second Page</title>
      <h1 className="text-4xl font-bold tracking-tight">
        Second Page (static)
      </h1>
      <img
        src="/static/images/image-placeholder.svg"
        alt="placeholder"
        className="w-[20px] h-[20px] object-contain mt-4"
        style={{ width: 20, height: 20 }}
      />
      <p>This is placeholder for a Textblock.</p>
      <Link to="/" className="mt-4 inline-block underline">
        Return home
      </Link>
      <Link to="/s/hello" className="mt-4 inline-block underline">
        Hello (static)
      </Link>
      <Link to="/s/page/hello" className="mt-4 inline-block underline">
        Hello (dynamic)
      </Link>
      <StreamingList />
    </div>
  );
}
