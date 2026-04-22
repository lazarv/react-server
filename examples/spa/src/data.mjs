export async function now() {
  "use cache: request";
  return new Date();
}

// ── Deterministic fixture data for the benchmark ────────────────────────────
//
// All data is generated from index-derived integer arithmetic — no Math.random,
// no clocks, no environment lookups. Output is byte-identical across the SSR
// shortcut and RSC pipeline variants, and repeatable run-over-run, so the
// benchmark numbers measure rendering cost rather than data jitter.

const CATEGORIES = [
  "Electronics",
  "Books",
  "Clothing",
  "Home",
  "Toys",
  "Garden",
];
const ACTIONS = ["create", "update", "delete", "view", "share"];
const TAGS = ["new", "sale", "popular", "limited", "featured", "exclusive"];
const ADJECTIVES = [
  "Premium",
  "Compact",
  "Wireless",
  "Eco-friendly",
  "Handcrafted",
  "Limited-edition",
  "Smart",
  "Portable",
];

export function products(count = 60) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    name: `${ADJECTIVES[i % ADJECTIVES.length]} Product ${i + 1}`,
    description: `High-quality item from the ${CATEGORIES[i % CATEGORIES.length]} catalog. SKU #${(i * 7919) % 100000}.`,
    price: 9.99 + ((i * 173) % 49000) / 100,
    rating: 1 + ((i * 13) % 41) / 10,
    reviews: ((i * 31) % 9000) + 12,
    category: CATEGORIES[i % CATEGORIES.length],
    tags: [TAGS[i % TAGS.length], TAGS[(i * 3 + 1) % TAGS.length]],
    inStock: i % 11 !== 0,
  }));
}

export function activityRows(count = 200) {
  const startMs = Date.UTC(2024, 0, 1);
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    timestamp: new Date(startMs + i * 86_400_000).toISOString().slice(0, 10),
    user: `user-${((i * 31) % 1000).toString().padStart(4, "0")}`,
    action: ACTIONS[i % ACTIONS.length],
    resource: `resource-${(i * 17) % 500}`,
    duration: ((i * 23) % 480) + 12,
    status: i % 7 === 0 ? "error" : i % 13 === 0 ? "warn" : "ok",
  }));
}

export function comments(count = 40) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    author: `Commenter ${i + 1}`,
    body: `${ADJECTIVES[i % ADJECTIVES.length]} take. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`,
    likes: (i * 3) % 137,
    replies: (i * 5) % 8,
  }));
}

export function stats() {
  return [
    { label: "Products", value: "60", delta: "+8%" },
    { label: "Active users", value: "12,480", delta: "+3%" },
    { label: "Orders today", value: "342", delta: "−5%" },
    { label: "Revenue (24h)", value: "$48.2k", delta: "+12%" },
    { label: "Conversion", value: "3.4%", delta: "+0.2pp" },
    { label: "Avg. session", value: "4m 12s", delta: "+8s" },
    { label: "Errors", value: "0.12%", delta: "−0.04pp" },
    { label: "Uptime (30d)", value: "99.98%", delta: "0pp" },
  ];
}
