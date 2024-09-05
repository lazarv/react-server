import "@mantine/core/styles.css";

import { createTheme, MantineProvider } from "@mantine/core";

const theme = createTheme({
  /** Put your mantine theme override here */
});

export default function Layout({ children }) {
  return (
    <html lang="en">
      <body>
        <MantineProvider theme={theme}>
          <h1>Layout</h1>
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}
