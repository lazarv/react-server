import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/charts/styles.css";
import "@mantine/code-highlight/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/nprogress/styles.css";
import "@mantine/spotlight/styles.css";
import "@mantine/carousel/styles.css";
import "@mantine/tiptap/styles.css";

import { usePathname } from "@lazarv/react-server";
import { ColorSchemeScript, createTheme, MantineProvider } from "@mantine/core";

import { AppLayout } from "../components/AppLayout";
import ModalsProvider from "../components/ModalsProvider";
import Notifications from "../components/Notifications";

const theme = createTheme({
  /** Put your mantine theme override here */
});

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <html lang="en" data-mantine-color-scheme="light">
      <head>
        <ColorSchemeScript />
      </head>
      <body>
        <MantineProvider theme={theme}>
          <ModalsProvider>
            <Notifications />
            <AppLayout serverPathname={pathname}>{children}</AppLayout>
          </ModalsProvider>
        </MantineProvider>
      </body>
    </html>
  );
}
