"use client";

/**
 * Medium page — client component SSR path.
 * Same as /medium but rendered as a client component.
 */

function ProductCard({ id }) {
  return (
    <article>
      <div style={{ background: "#f0f0f0", height: 200, width: "100%" }} />
      <h3>Product {id}</h3>
      <p>
        High-quality item with excellent features. Perfect for everyday use.
        Rating: {(id % 5) + 1}/5 stars.
      </p>
      <div>
        <span>${((id * 17 + 29) % 200) + 9.99}</span>
        {id % 3 === 0 && <span> (On Sale)</span>}
      </div>
      <button>Add to Cart</button>
    </article>
  );
}

export default function Medium() {
  const products = Array.from({ length: 50 }, (_, i) => i + 1);
  return (
    <main>
      <header>
        <h1>Products</h1>
        <p>Showing {products.length} items</p>
      </header>
      <div>
        {products.map((id) => (
          <ProductCard key={id} id={id} />
        ))}
      </div>
    </main>
  );
}
