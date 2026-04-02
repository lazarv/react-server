export default function About() {
  return (
    <div>
      <h2>About</h2>
      <p>
        This page is a server-rendered route created with{" "}
        <code>{'createRoute("/about", { exact: true })'}</code>.
      </p>
      <p>
        Since this is a React Server Component, it renders on the server with
        zero client-side JavaScript.
      </p>
    </div>
  );
}
