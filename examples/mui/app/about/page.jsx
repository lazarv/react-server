"use client";

import { Link as ReactServerLink } from "@lazarv/react-server/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";

export default function About() {
  return (
    <Box sx={{ maxWidth: "sm" }}>
      <Button variant="contained" component={ReactServerLink} to="/">
        Go to the home page
      </Button>
    </Box>
  );
}
