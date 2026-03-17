import { user, products } from "./routes";

export default function Home() {
  return (
    <div>
      <h2>Home</h2>
      <p>Welcome to the typed router example!</p>
      <p>
        This example demonstrates <code>createRoute</code> /{" "}
        <code>createRouter</code> for type-safe routing with Zod validation.
      </p>
      <h3>Try these links:</h3>
      <ul style={{ lineHeight: 2 }}>
        <li>
          <user.Link params={{ id: 1 }}>User 1</user.Link> — typed{" "}
          <code>.Link</code> builds <code>/user/1</code>
        </li>
        <li>
          <user.Link params={{ id: 42 }}>User 42</user.Link> — typed{" "}
          <code>.Link</code> builds <code>/user/42</code>
        </li>
        <li>
          <products.Link
            search={{ sort: "price", min_price: 50, max_price: 150 }}
          >
            Products (price-sorted, $50–$150)
          </products.Link>{" "}
          — Zod validate + SearchParams decode/encode
        </li>
      </ul>
    </div>
  );
}
