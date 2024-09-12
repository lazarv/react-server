import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/charts/styles.css";
import "@mantine/code-highlight/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/spotlight/styles.css";
import "@mantine/carousel/styles.css";
import "@mantine/tiptap/styles.css";

import { ColorSchemeScript, createTheme, MantineProvider } from "@mantine/core";

import ModalsProvider from "../components/ModalsProvider";
import Notifications from "../components/Notifications";

const theme = createTheme({
  /** Put your mantine theme override here */
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-mantine-color-scheme="light">
      <head>
        <ColorSchemeScript />
      </head>
      <body>
        <MantineProvider theme={theme}>
          <ModalsProvider>
            <h1>Layout</h1>
            {children}
            <Notifications />
          </ModalsProvider>
        </MantineProvider>
      </body>
    </html>
  );
}
