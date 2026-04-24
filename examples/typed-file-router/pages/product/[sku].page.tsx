import { product, productSkuUppercase } from "@lazarv/react-server/routes";

export default product.createPage(({ sku }) => {
  return (
    <div>
      <h1>Product (any SKU)</h1>
      <p>
        SKU: <strong data-testid="sku-any">{sku}</strong>
      </p>
      <p data-testid="route">matched=[sku]</p>
      <p>
        This is the fallback. The sibling <code>[sku=uppercase]</code> is tried
        first and its matcher rejected this value. Try an uppercase SKU to hit
        the matcher:{" "}
        <productSkuUppercase.Link params={{ sku: "ABC-123" }}>
          /product/ABC-123
        </productSkuUppercase.Link>
        .
      </p>
    </div>
  );
});
