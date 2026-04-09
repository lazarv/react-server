/**
 * Wide page — 1000 sibling components.
 * Tests RSC serialization and HTML rendering with broad, flat trees.
 * ~3000 elements, ~30KB HTML.
 */

function Item({ i }) {
  return (
    <li>
      <span>Item #{i}</span> — <em>{i % 2 === 0 ? "even" : "odd"}</em>
    </li>
  );
}

export default function Wide() {
  const items = Array.from({ length: 1000 }, (_, i) => i + 1);
  return (
    <main>
      <h1>Wide Tree (1000 siblings)</h1>
      <ul>
        {items.map((i) => (
          <Item key={i} i={i} />
        ))}
      </ul>
    </main>
  );
}
