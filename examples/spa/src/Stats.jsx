import { stats } from "./data.mjs";

// Module-scoped fixture: built once per process when the module loads.
// Imported from a server module → renders as a server component (RSC variant).
// Imported transitively through a "use client" boundary → bundles as a client
// component and SSRs through React DOM (SSR shortcut variant).
const STATS = stats();

export default function Stats() {
  return (
    <section>
      <h2 className="text-2xl font-bold mb-4">Overview</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {STATS.map((s) => (
          <div
            key={s.label}
            className="bg-white p-4 rounded-lg shadow-sm border border-gray-100"
          >
            <p className="text-xs uppercase text-gray-500 tracking-wide">
              {s.label}
            </p>
            <p className="text-2xl font-bold mt-2">{s.value}</p>
            <p
              className={`text-xs mt-1 ${
                s.delta.startsWith("−")
                  ? "text-red-600"
                  : s.delta.startsWith("+")
                    ? "text-green-600"
                    : "text-gray-500"
              }`}
            >
              {s.delta} vs last period
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
