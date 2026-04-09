/**
 * Deep nesting page — 100 levels of component nesting.
 * Tests React reconciler / RSC serialization overhead with deep trees.
 * Small HTML output but deep virtual DOM.
 */

function Wrapper({ depth, children }) {
  if (depth <= 0) return <div className="leaf">{children}</div>;
  return (
    <div className={`depth-${depth}`}>
      <Wrapper depth={depth - 1}>{children}</Wrapper>
    </div>
  );
}

export default function Deep() {
  return (
    <main>
      <h1>Deep Nesting (100 levels)</h1>
      <Wrapper depth={100}>
        <p>Leaf node at the bottom of the tree.</p>
      </Wrapper>
    </main>
  );
}
