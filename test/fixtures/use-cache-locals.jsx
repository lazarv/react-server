import { useSearchParams } from "@lazarv/react-server";

// Test 1: Function parameter closure — the plugin must capture `prefix` as a local
function makeGreeting(prefix) {
  async function greet(name) {
    "use cache";
    return `${prefix}: ${name}`;
  }
  return greet;
}

// Test 2: Destructured variable closure — the plugin must capture destructured bindings
function makeFormatter() {
  const { locale, currency } = {
    locale: "en-US",
    currency: "USD",
  };
  async function format(amount) {
    "use cache";
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).format(amount);
  }
  return format;
}

// Test 3: Array destructured variable closure
function makeLabel() {
  const [left, right] = ["[", "]"];
  async function label(text) {
    "use cache";
    return `${left}${text}${right}`;
  }
  return label;
}

// Test 4: Exported cached function — should work with __react_cache__ wrapping
export async function getCachedTime(id) {
  "use cache";
  return { id, time: new Date().toISOString() };
}

export default async function App() {
  const { id } = useSearchParams();
  const greet = makeGreeting("Hello");
  const format = makeFormatter();
  const label = makeLabel();

  const greeting = await greet(id ?? "World");
  const formatted = await format(42);
  const labeled = await label("test");
  const cached = await getCachedTime(id ?? "default");

  return (
    <div>
      <div id="greeting">{greeting}</div>
      <div id="formatted">{formatted}</div>
      <div id="labeled">{labeled}</div>
      <div id="cached-id">{cached.id}</div>
      <div id="cached-time">{cached.time}</div>
    </div>
  );
}
