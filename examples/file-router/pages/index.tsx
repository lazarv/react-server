import { Link } from "@lazarv/react-server/navigation";

export default function IndexPage() {
  return (
    <div>
      <h1>Welcome to the File Router Example</h1>
      <p>This is the home page of the file-based routing example.</p>
      <Link to="/about">Go to About Page</Link>
      <br />
      <Link to="/auth">Go to Login Page</Link>
      <br />
      <Link to="/forms">Go to Forms Page</Link>
      <br />
      <Link to="/forms-simple">Go to Simple Forms Page</Link>
      <br />
      <Link to="/notexisting">404 Route not found</Link>
      <h2>Redirect:</h2>
      <Link to="/redirect-notfound">404 Route not found</Link>
      <br />
      <Link to="/redirect-external">External</Link>
      <br />
      <Link to="/redirect-api-external">External with API</Link>
      <br />
      <Link to="/redirect-about">Internal redirect to existing about page</Link>
      <h2>Error:</h2>
      <Link to="/middleware-error">Throw error in middleware</Link>
    </div>
  );
}
