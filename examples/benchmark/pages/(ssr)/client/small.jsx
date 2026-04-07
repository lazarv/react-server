"use client";

/**
 * Small page — client component SSR path.
 * Same as /small but rendered as a client component.
 */
export default function Small() {
  return (
    <main>
      <header>
        <nav>
          <a href="/">Home</a>
          <a href="/about">About</a>
          <a href="/contact">Contact</a>
        </nav>
      </header>
      <section>
        <h1>Welcome to Our Platform</h1>
        <p>
          Build modern web applications with server components. Fast, reliable,
          and easy to use.
        </p>
        <div>
          <button>Get Started</button>
          <button>Learn More</button>
        </div>
      </section>
      <footer>
        <p>&copy; 2026 Benchmark App</p>
      </footer>
    </main>
  );
}
