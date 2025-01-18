import "@mantine/core/styles.css";

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
    <html lang="en" data-mantine-color-scheme="light" suppressHydrationWarning>
      <head>
        <ColorSchemeScript />
      </head>
      <body suppressHydrationWarning>
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
