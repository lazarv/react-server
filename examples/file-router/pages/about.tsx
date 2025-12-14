import { Link } from "@lazarv/react-server/navigation";

export default function AboutPage() {
  return (
    <div>
      <h1>About Page</h1>
      <p>This is the about page of the file-based routing example.</p>
      <Link to="/">Go to Home Page</Link>
    </div>
  );
}
