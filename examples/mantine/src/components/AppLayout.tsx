"use client";

import { Link } from "@lazarv/react-server/navigation";
import { AppShell, Burger, Group, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";

import AppLogo from "./AppLogo";
import { MainNavigation } from "./MainNavigation";

export function AppLayout({
  serverPathname,
  children,
}: {
  serverPathname: string;
  children: React.ReactNode;
}) {
  const [opened, { toggle }] = useDisclosure();

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 300,
        breakpoint: "sm",
        collapsed: { mobile: !opened },
      }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md">
          <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
          <Link to="/" style={{ textDecoration: "none", color: "inherit" }}>
            <Group ml="lg">
              <AppLogo height={"50px"} width={"50px"} />
              <Title order={1}>Mantine</Title>
            </Group>
          </Link>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <MainNavigation serverPathname={serverPathname} />
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
