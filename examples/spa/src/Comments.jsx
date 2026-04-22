import { comments } from "./data.mjs";

const COMMENTS = comments();

export default function Comments() {
  return (
    <section>
      <h2 className="text-2xl font-bold mb-4">Comments</h2>
      <ul className="space-y-3">
        {COMMENTS.map((c) => (
          <li
            key={c.id}
            className="bg-white p-4 rounded-lg shadow-sm border border-gray-100"
          >
            <div className="flex items-center justify-between">
              <p className="font-semibold">{c.author}</p>
              <p className="text-xs text-gray-500">
                ♥ {c.likes} · {c.replies} replies
              </p>
            </div>
            <p className="text-sm text-gray-700 mt-2">{c.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
