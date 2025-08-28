import "~/global.css";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-screen" suppressHydrationWarning>
      <head></head>
      <body
        className="w-full min-h-full flex flex-col justify-center items-center dark:bg-zinc-900 dark:text-gray-400"
        suppressHydrationWarning
      >
        <a
          href="https://github.com/lazarv/react-server"
          target="_blank"
          rel="noreferrer"
        >
          <img
            src="/github.svg"
            alt="GitHub page"
            className="absolute top-2 right-2 w-6 h-6"
          />
        </a>
        {children}
        <p className="text-sm mt-auto mb-2">
          Visit{" "}
          <a
            href="https://react-server.dev"
            target="_blank"
            className="text-indigo-500 dark:text-yellow-500"
            rel="noreferrer"
          >
            react-server.dev
          </a>{" "}
          to learn more about <b>@lazarv/react-server</b>.
        </p>
      </body>
    </html>
  );
}
