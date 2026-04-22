import { activityRows } from "./data.mjs";

const ACTIVITY = activityRows();

export default function Activity() {
  return (
    <section>
      <h2 className="text-2xl font-bold mb-4">Activity log</h2>
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Resource</th>
              <th className="px-3 py-2 text-right">Duration</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {ACTIVITY.map((r) => (
              <tr
                key={r.id}
                className={`border-t border-gray-100 ${
                  r.status === "error"
                    ? "bg-red-50"
                    : r.status === "warn"
                      ? "bg-yellow-50"
                      : ""
                }`}
              >
                <td className="px-3 py-2 font-mono text-xs">{r.timestamp}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.user}</td>
                <td className="px-3 py-2">{r.action}</td>
                <td className="px-3 py-2 text-gray-600">{r.resource}</td>
                <td className="px-3 py-2 text-right">{r.duration}ms</td>
                <td className="px-3 py-2">
                  <span
                    className={`text-xs font-medium ${
                      r.status === "error"
                        ? "text-red-700"
                        : r.status === "warn"
                          ? "text-yellow-700"
                          : "text-green-700"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
