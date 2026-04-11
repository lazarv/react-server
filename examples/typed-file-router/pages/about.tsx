import { about } from "@lazarv/react-server/routes";

export default about.createPage(() => {
  return (
    <div>
      <h1>About</h1>
      <p>
        This is a simple page with no dynamic params — auto-named "about" from
        path.
      </p>
    </div>
  );
});
