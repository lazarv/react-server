import { index } from "@lazarv/react-server/routes";

export const route = "index";

export default index.createPage(() => {
  return (
    <div>
      <h1>Welcome to Typed File Router</h1>
      <p>
        This example demonstrates the typed file-router integration with
        auto-generated route descriptors and context-aware helper functions.
      </p>
      <h2>Features</h2>
      <ul>
        <li>
          <code>createPage</code> — typed page components with validated params
        </li>
        <li>
          <code>createLayout</code> — typed layouts with branded outlet props
        </li>
        <li>
          <code>createLoading</code> — typed loading components
        </li>
        <li>Branded outlet types with nullability tracking</li>
        <li>
          Route descriptors with typed <code>.Link</code> and{" "}
          <code>.href()</code>
        </li>
        <li>
          <a href="/virtual">Virtual routes</a> — map URL paths to files outside
          the <code>pages/</code> directory
        </li>
      </ul>
    </div>
  );
});
