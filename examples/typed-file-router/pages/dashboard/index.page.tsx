import { dashboard } from "@lazarv/react-server/routes";

export default dashboard.createPage(() => {
  return (
    <div>
      <p>Welcome to the dashboard. This page demonstrates typed outlets.</p>
      <p>
        The <code>sidebar</code> outlet is nullable (no default) while the{" "}
        <code>content</code> outlet always renders (has a default).
      </p>
    </div>
  );
});
