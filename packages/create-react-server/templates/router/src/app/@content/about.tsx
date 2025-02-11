function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-indigo-500 dark:text-yellow-600"
    >
      {children}
    </a>
  );
}

export default function About() {
  return (
    <article className="flex flex-col gap-4 max-w-screen-lg m-8 text-lg">
      <h1 className="text-2xl font-bold mb-0">About This App</h1>
      <h2 className="text-xl font-semibold m-0">🛠 The framework</h2>
      <p>
        <b>@lazarv/react-server</b> is a modern meta-framework designed for
        building high-performance, server-driven React applications. It
        leverages React Server Components (RSC) with a unique delegation
        approach, enabling seamless micro-frontend architectures and efficient
        server-side rendering. With native ES module support and Vite-powered
        optimizations, it ensures a fast and scalable developer experience.
      </p>
      <p>
        Built for flexibility, <b>@lazarv/react-server</b> provides fine-grained
        caching, robust runtime integrations, and a streamlined development
        workflow. Whether you{"'"}re crafting a single app or orchestrating
        multiple micro-frontends, it offers the tools to enhance performance,
        maintainability, and scalability.
      </p>
      <h2 className="text-xl font-semibold m-0">
        🚀 Welcome to Your New React Server App!
      </h2>
      <p>
        This project was created using the <b>@lazarv/create-react-server</b>{" "}
        CLI tool, setting up a fully functional React Server Components (RSC)
        app with file-system based routing and server functions out of the box.
      </p>
      <h2 className="text-xl font-semibold m-0">
        🗂 File-system based routing
      </h2>
      <ul className="list-disc pl-6">
        <li>
          Add files to <b>/src/app</b> to{" "}
          <Link href="https://react-server.dev/router/define-routes">
            define
          </Link>{" "}
          layouts, pages and{" "}
          <Link href="https://react-server.dev/router/api">API routes</Link>
        </li>
        <li>
          Use{" "}
          <Link href="https://react-server.dev/router/outlets">outlets</Link> to
          optimize loading content
        </li>
        <li>
          Add{" "}
          <Link href="https://react-server.dev/router/loading">loading</Link>{" "}
          and{" "}
          <Link href="https://react-server.dev/router/error-handling">
            error handling
          </Link>{" "}
          to your routes
        </li>
      </ul>
      <h2 className="text-xl font-semibold m-0 flex items-center">
        <img src="/react-server.svg" alt="" className="inline-block h-4 mr-1" />{" "}
        Use React Server Components & Server Functions
      </h2>
      <ul className="list-disc pl-6">
        <li>
          React Server Components allow efficient rendering without client-side
          JavaScript
        </li>
        <li>
          Client Components can be used by adding <b>{`"use client";`}</b> at
          the top of a file
        </li>
        <li>
          Server Functions enable seamless server-side logic execution by using{" "}
          <b>{`"use server";`}</b>
        </li>
      </ul>
      <h2 className="text-xl font-semibold m-0">📌 Need Help?</h2>
      <p>
        Check out the official{" "}
        <Link href="https://react-server.dev">documentation</Link> or join the{" "}
        <Link href="https://github.com/lazarv/react-server/discussions">
          discussions
        </Link>{" "}
        for support!
      </p>
    </article>
  );
}
