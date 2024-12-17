import "./index.css";

import { Link } from "@lazarv/react-server/navigation";

import Counter from "./Counter";

export default function App() {
  return (
    <div>
      <h1>Hello World</h1>
      <p>This is a server-rendered React application.</p>
      <Counter />
      <Link to="/about" prefetch>
        About
      </Link>{" "}
      |{" "}
      <Link to="/s/page" prefetch>
        Second Page
      </Link>
    </div>
  );
}
