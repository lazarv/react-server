import { Route } from "@lazarv/react-server/router";
import { Link } from "@lazarv/react-server/navigation";

export default function Navigation({ message, children }) {
  return (
    <>
      <Route path="/" exact>
        <div>
          <p>{message}</p>
          {children}
          <Link to="/about" local>
            Go to About
          </Link>
        </div>
      </Route>
      <Route path="/about">
        <div>
          <p>This is the about page.</p>
          {children}
          <Link to="/" local>
            Go back to Home
          </Link>
        </div>
      </Route>
    </>
  );
}
