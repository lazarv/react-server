"use client";

import { useRef, useCallback } from "react";
import {
  Link,
  usePathname,
  useScrollContainer,
  useScrollPosition,
} from "@lazarv/react-server/navigation";

export default function App() {
  const pathname = usePathname();

  return (
    <>
      <ScrollPositionHandler />
      <Nav />
      <ScrollInfo />
      {pathname === "/" && <HomePage />}
      {pathname === "/page-a" && <PageA />}
      {pathname === "/page-b" && <PageB />}
      {pathname === "/page-c" && <PageC />}
      {pathname === "/page-d" && <PageD />}
      {pathname === "/page-e" && <ScrollContainerPage />}
      {pathname === "/skip-scroll" && <SkipScrollPage />}
    </>
  );
}

function Nav() {
  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        background: "#fff",
        zIndex: 10,
        padding: "8px 16px",
        borderBottom: "1px solid #ccc",
        display: "flex",
        gap: "16px",
      }}
    >
      <Link to="/" data-testid="nav-home">
        Home
      </Link>
      <Link to="/page-a" data-testid="nav-page-a">
        Page A
      </Link>
      <Link to="/page-b" data-testid="nav-page-b">
        Page B
      </Link>
      <Link to="/page-c?filter=1" data-testid="nav-page-c-filter1">
        Page C (filter=1)
      </Link>
      <Link to="/page-c?filter=2" data-testid="nav-page-c-filter2">
        Page C (filter=2)
      </Link>
      <Link to="/page-d#section-20" data-testid="nav-page-d-hash">
        Page D (#section-20)
      </Link>
      <Link to="/page-e" data-testid="nav-page-e">
        Page E (scroll container)
      </Link>
      <Link to="/skip-scroll" data-testid="nav-skip-scroll">
        Skip Scroll
      </Link>
    </nav>
  );
}

function LongContent({ id, count = 50 }) {
  return (
    <div style={{ paddingTop: "60px" }}>
      <h1 data-testid="page-title">{id}</h1>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          id={`section-${i}`}
          data-testid={`section-${i}`}
          style={{
            height: "100px",
            padding: "20px",
            background: i % 2 === 0 ? "#f0f0f0" : "#e0e0e0",
            borderBottom: "1px solid #ccc",
          }}
        >
          {id} - Section {i}
        </div>
      ))}
    </div>
  );
}

function HomePage() {
  return <LongContent id="Home" />;
}

function PageA() {
  return <LongContent id="Page A" />;
}

function PageB() {
  return <LongContent id="Page B" />;
}

function PageC() {
  return <LongContent id="Page C" />;
}

function PageD() {
  return <LongContent id="Page D" />;
}

function SkipScrollPage() {
  return <LongContent id="Skip Scroll Page" />;
}

function ScrollContainerWrapper() {
  const containerRef = useRef(null);
  useScrollContainer("sidebar", containerRef);

  return (
    <aside
      ref={containerRef}
      data-testid="scroll-container"
      style={{
        width: "200px",
        height: "300px",
        overflow: "auto",
        border: "1px solid #ccc",
      }}
    >
      {Array.from({ length: 30 }, (_, i) => (
        <div
          key={i}
          data-testid={`container-item-${i}`}
          style={{
            height: "50px",
            padding: "10px",
            background: i % 2 === 0 ? "#d0d0ff" : "#c0c0ff",
          }}
        >
          Sidebar Item {i}
        </div>
      ))}
    </aside>
  );
}

function ScrollContainerPage() {
  return (
    <div style={{ paddingTop: "60px", display: "flex", gap: "16px" }}>
      <ScrollContainerWrapper />
      <main>
        <h1 data-testid="page-title">Page E</h1>
        <LongContent id="Page E Content" count={30} />
      </main>
    </div>
  );
}

function ScrollPositionHandler() {
  const handler = useCallback(({ to }) => {
    if (to.split("?")[0] === "/skip-scroll") {
      return false;
    }
    return undefined;
  }, []);
  useScrollPosition(handler);
  return null;
}

function ScrollInfo() {
  return (
    <div
      data-testid="scroll-info"
      style={{
        position: "fixed",
        bottom: 0,
        right: 0,
        background: "rgba(0,0,0,0.8)",
        color: "#fff",
        padding: "4px 8px",
        fontSize: "12px",
        zIndex: 20,
      }}
    />
  );
}
