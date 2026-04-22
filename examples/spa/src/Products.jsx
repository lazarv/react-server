import { products } from "./data.mjs";

const PRODUCTS = products();

export default function Products() {
  return (
    <section>
      <h2 className="text-2xl font-bold mb-4">Products</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {PRODUCTS.map((p) => (
          <article
            key={p.id}
            className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex flex-col"
          >
            <div className="flex items-start justify-between">
              <h3 className="font-semibold text-sm">{p.name}</h3>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  p.inStock
                    ? "bg-green-100 text-green-800"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {p.inStock ? "in stock" : "sold out"}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">{p.category}</p>
            <p className="text-sm text-gray-700 mt-2 flex-1">{p.description}</p>
            <div className="mt-3 flex items-center gap-2">
              {p.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between border-t pt-3">
              <span className="font-bold">${p.price.toFixed(2)}</span>
              <span className="text-xs text-gray-600">
                ★ {p.rating.toFixed(1)}{" "}
                <span className="text-gray-400">({p.reviews})</span>
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
