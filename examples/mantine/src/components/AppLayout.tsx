"use client";
import { Link } from "@lazarv/react-server/navigation";
import { AppShell, Burger, Group, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";

import AppLogo from "./AppLogo";
import { MainNavigation } from "./MainNavigation";

export function AppLayout({ children }: { children: React.ReactNode }) {
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
        <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
        <Link to="/">
          <Group ml="lg">
            <AppLogo height={"50px"} width={"50px"} />
            <Title order={1}>Mantine</Title>
          </Group>
        </Link>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <MainNavigation />
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
