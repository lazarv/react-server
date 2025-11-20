import { Link } from "@lazarv/react-server/navigation";

export default function IndexPage() {
  return (
    <div>
      <h1>Welcome to the File Router Example</h1>
      <p>This is the home page of the file-based routing example.</p>
      <a href="/about">Go to About Page</a>
      <br />
      <a href="/auth">Go to Login Page</a>
      <br />
      <a href="/forms">Go to Forms Page</a>
      <br />
      <a href="/forms-simple">Go to Simple Forms Page</a>
      <br />
      <Link to="/notexisting">404 Route not found</Link>
      <br />
      <b>Redirect:</b>
      <br />
      <Link to="/redirect-notfound">404 Route not found</Link>
      <br />
      <Link to="/redirect-external">External</Link>
      <br />
      <Link to="/redirect-api-external">External with API</Link>
      <br />
      <Link to="/about">Internal redirect to existing about page</Link>
    </div>
  );
}
