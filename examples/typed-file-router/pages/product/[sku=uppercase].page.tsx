import { product, productSkuUppercase } from "@lazarv/react-server/routes";

export const matchers = productSkuUppercase.createMatchers({
  uppercase: (value) => /^[A-Z0-9-]+$/.test(value),
});

export default productSkuUppercase.createPage(({ sku }) => {
  return (
    <div>
      <h1>Product (uppercase SKU)</h1>
      <p>
        SKU: <strong data-testid="sku-upper">{sku}</strong>
      </p>
      <p data-testid="route">matched=[sku=uppercase]</p>
      <p>
        This page is gated by{" "}
        <code>matchers.uppercase = (v) =&gt; /^[A-Z0-9-]+$/.test(v)</code>. Try
        a lowercase SKU to fall through to the sibling route:{" "}
        <product.Link params={{ sku: "abc-123" }}>
          /product/abc-123
        </product.Link>
        .
      </p>
    </div>
  );
});
