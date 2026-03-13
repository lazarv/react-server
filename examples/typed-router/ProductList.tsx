"use client";

import { useNavigate } from "@lazarv/react-server/navigation";
import { products } from "./routes";

// Simple seeded PRNG for deterministic data
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(42);
const ITEMS = Array.from({ length: 30 }, (_, i) => ({
  id: i + 1,
  name: `Product ${i + 1}`,
  price: Math.round((rand() * 200 + 5) * 100) / 100,
  rating: Math.round((rand() * 4 + 1) * 10) / 10,
}));

const SORT_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "price", label: "Price" },
  { value: "rating", label: "Rating" },
] as const;

const PAGE_SIZE = 8;

function sortItems(items: typeof ITEMS, sort: string) {
  const sorted = [...items];
  switch (sort) {
    case "price":
      return sorted.toSorted((a, b) => a.price - b.price);
    case "rating":
      return sorted.toSorted((a, b) => b.rating - a.rating);
    case "name":
    default:
      return sorted.toSorted((a, b) => a.name.localeCompare(b.name));
  }
}

export default function ProductList() {
  // products.useSearchParams() reads URL search params and validates them
  // through the Zod schema defined in routes.ts — invalid values get defaults.
  const { sort, page } = products.useSearchParams();
  const navigate = useNavigate();

  const sorted = sortItems(ITEMS, sort);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pageItems = sorted.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  function updateSearch(updates: { sort?: string; page?: number }) {
    const params = new URLSearchParams();
    const next = { sort, page, ...updates };
    if (next.sort !== "name") params.set("sort", next.sort);
    if (next.page > 1) params.set("page", String(next.page));
    const qs = params.toString();
    navigate(`/products${qs ? `?${qs}` : ""}`);
  }

  return (
    <div>
      <h2>Products</h2>
      <p>
        Search params are validated with <code>products.useSearchParams()</code>
        .
      </p>
      <p>
        <code>sort</code> defaults to <code>"name"</code>, <code>page</code>{" "}
        defaults to <code>1</code>. Try <code>?sort=price&page=2</code> in the
        URL.
      </p>

      {/* Sort controls */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <span>Sort by:</span>
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => updateSearch({ sort: opt.value, page: 1 })}
            style={{
              fontWeight: sort === opt.value ? "bold" : "normal",
              textDecoration: sort === opt.value ? "underline" : "none",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Product table */}
      <table
        style={{ borderCollapse: "collapse", width: "100%", maxWidth: 500 }}
      >
        <thead>
          <tr>
            {["#", "Name", "Price", "Rating"].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  borderBottom: "2px solid #ccc",
                  padding: "0.4rem 0.8rem",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pageItems.map((item) => (
            <tr key={item.id}>
              <td style={{ padding: "0.3rem 0.8rem" }}>{item.id}</td>
              <td style={{ padding: "0.3rem 0.8rem" }}>{item.name}</td>
              <td style={{ padding: "0.3rem 0.8rem" }}>
                ${item.price.toFixed(2)}
              </td>
              <td style={{ padding: "0.3rem 0.8rem" }}>
                {item.rating.toFixed(1)}★
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginTop: "1rem",
          alignItems: "center",
        }}
      >
        <button
          disabled={safePage <= 1}
          onClick={() => updateSearch({ page: safePage - 1 })}
        >
          ← Prev
        </button>
        <span>
          Page {safePage} / {totalPages}
        </span>
        <button
          disabled={safePage >= totalPages}
          onClick={() => updateSearch({ page: safePage + 1 })}
        >
          Next →
        </button>
      </div>

      <p style={{ color: "gray", fontSize: "0.85rem", marginTop: "1rem" }}>
        Current search params: sort=<strong>{sort}</strong>, page=
        <strong>{page}</strong>
      </p>
    </div>
  );
}
