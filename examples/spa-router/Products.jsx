"use client";

import { useSearchParams, useNavigate } from "@lazarv/react-server/navigation";

// Simple seeded PRNG (mulberry32) — deterministic across server & client
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(42);

const ITEMS = Array.from({ length: 60 }, (_, i) => ({
  id: i + 1,
  name: `Product ${i + 1}`,
  price: Math.round((rand() * 200 + 5) * 100) / 100,
  rating: Math.round((rand() * 4 + 1) * 10) / 10,
  category: ["Electronics", "Clothing", "Books", "Home", "Sports"][i % 5],
}));

const SORT_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "price-asc", label: "Price: Low → High" },
  { value: "price-desc", label: "Price: High → Low" },
  { value: "rating", label: "Rating" },
];

const CATEGORIES = [
  "All",
  "Electronics",
  "Clothing",
  "Books",
  "Home",
  "Sports",
];

function sortItems(items, sort) {
  const sorted = [...items];
  switch (sort) {
    case "price-asc":
      return sorted.toSorted((a, b) => a.price - b.price);
    case "price-desc":
      return sorted.toSorted((a, b) => b.price - a.price);
    case "rating":
      return sorted.toSorted((a, b) => b.rating - a.rating);
    case "name":
    default:
      return sorted.toSorted((a, b) => a.name.localeCompare(b.name));
  }
}

export default function Products() {
  const searchParams = useSearchParams() || {};
  const navigate = useNavigate();

  const sort = searchParams.sort || "name";
  const category = searchParams.cat || "All";

  const filtered =
    category === "All"
      ? ITEMS
      : ITEMS.filter((item) => item.category === category);
  const sorted = sortItems(filtered, sort);

  function updateParam(key, value) {
    const params = new URLSearchParams();
    const current = { ...searchParams, [key]: value };
    for (const [k, v] of Object.entries(current)) {
      if (k === "sort" && v === "name") continue;
      if (k === "cat" && v === "All") continue;
      params.set(k, v);
    }
    const qs = params.toString();
    navigate(`/products${qs ? `?${qs}` : ""}`);
  }

  return (
    <div>
      <h2>Products</h2>
      <p style={{ color: "gray", fontSize: "0.85rem", marginBottom: "1rem" }}>
        Scroll down the list, then change the <strong>sort</strong> or{" "}
        <strong>filter</strong> — the URL updates but{" "}
        <code>useScrollPosition</code> returns <code>false</code> so you keep
        your scroll position. Navigate to a different page and come back —
        scroll resets to top as usual.
      </p>

      <div
        style={{
          display: "flex",
          gap: "1rem",
          alignItems: "center",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          position: "sticky",
          top: 0,
          background: "white",
          padding: "0.75rem 0",
          borderBottom: "1px solid #eee",
          zIndex: 10,
        }}
      >
        <label>
          Sort:{" "}
          <select
            value={sort}
            onChange={(e) => updateParam("sort", e.target.value)}
            style={{ padding: "0.3rem" }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Category:{" "}
          <select
            value={category}
            onChange={(e) => updateParam("cat", e.target.value)}
            style={{ padding: "0.3rem" }}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <span style={{ color: "gray", fontSize: "0.85rem" }}>
          {sorted.length} items
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: "1rem",
        }}
      >
        {sorted.map((item) => (
          <div
            key={item.id}
            style={{
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: "1rem",
              background: "#fafafa",
            }}
          >
            <div
              style={{
                width: "100%",
                height: 120,
                background: `hsl(${(item.id * 37) % 360}, 40%, 85%)`,
                borderRadius: 4,
                marginBottom: "0.75rem",
              }}
            />
            <strong>{item.name}</strong>
            <div style={{ fontSize: "0.9rem", color: "#555" }}>
              {item.category}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "0.5rem",
              }}
            >
              <span style={{ fontWeight: 600 }}>${item.price.toFixed(2)}</span>
              <span style={{ color: "#e8a100" }}>★ {item.rating}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
