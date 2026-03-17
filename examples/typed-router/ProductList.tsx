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

const PRICE_PRESETS = [
  { label: "All", min: 0, max: 10000 },
  { label: "Under $50", min: 0, max: 50 },
  { label: "$50–$100", min: 50, max: 100 },
  { label: "$100–$150", min: 100, max: 150 },
  { label: "Over $150", min: 150, max: 10000 },
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
  // through the Zod schema in routes.ts. min_price and max_price come from
  // the decoded ?price=min-max — the ProductPriceRange SearchParams transform
  // in App.tsx splits that into separate params before Zod sees them.
  const { sort, page, min_price, max_price } = products.useSearchParams();
  const navigate = useNavigate();

  const sorted = sortItems(ITEMS, sort);
  const priceFiltered = sorted.filter(
    (item) => item.price >= min_price && item.price <= max_price
  );
  const totalPages = Math.ceil(priceFiltered.length / PAGE_SIZE);
  const safePage = Math.min(Math.max(page, 1), totalPages || 1);
  const pageItems = priceFiltered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  return (
    <div>
      <h2>Products</h2>
      <p>
        Search params are validated with Zod via{" "}
        <code>products.useSearchParams()</code>. The price filter is stored as{" "}
        <code>?price=min-max</code> in the URL and decoded to{" "}
        <code>min_price</code> / <code>max_price</code> by the route-scoped{" "}
        <code>SearchParams</code> transform before validation runs.
      </p>

      {/* Sort controls */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <span>Sort:</span>
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() =>
              navigate(products, { search: { sort: opt.value, page: 1 } })
            }
            style={{
              fontWeight: sort === opt.value ? "bold" : "normal",
              textDecoration: sort === opt.value ? "underline" : "none",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Price range filter — navigate with min_price/max_price; the encode
          transform converts them to ?price=min-max in the URL */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <span>Price:</span>
        {PRICE_PRESETS.map((p) => {
          const active = min_price === p.min && max_price === p.max;
          return (
            <button
              key={p.label}
              onClick={() =>
                navigate(products, {
                  search: { min_price: p.min, max_price: p.max, page: 1 },
                })
              }
              style={{
                fontWeight: active ? "bold" : "normal",
                textDecoration: active ? "underline" : "none",
              }}
            >
              {p.label}
            </button>
          );
        })}
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
          {pageItems.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ padding: "0.8rem", color: "gray" }}>
                No products in this price range.
              </td>
            </tr>
          ) : (
            pageItems.map((item) => (
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
            ))
          )}
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
          onClick={() => navigate(products, { search: { page: safePage - 1 } })}
        >
          ← Prev
        </button>
        <span>
          Page {safePage} / {totalPages || 1}
        </span>
        <button
          disabled={safePage >= totalPages}
          onClick={() => navigate(products, { search: { page: safePage + 1 } })}
        >
          Next →
        </button>
      </div>

      <p style={{ color: "gray", fontSize: "0.85rem", marginTop: "1rem" }}>
        Decoded params: sort=<strong>{sort}</strong>, page=
        <strong>{page}</strong>, min_price=<strong>{min_price}</strong>,
        max_price=<strong>{max_price}</strong> ({priceFiltered.length} items)
      </p>
    </div>
  );
}
