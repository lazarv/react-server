"use client";

import { Link as ReactServerLink } from "@lazarv/react-server/navigation";
import Link from "@mui/material/Link";

export default function Home() {
  return (
    <Link to="/about" color="secondary" component={ReactServerLink}>
      Go to the about page
    </Link>
  );
}
