import App from "../components/App";
import "./index.css";

export default async function Layout({
  children,
  ...outlets
}: {
  children: React.ReactNode;
  posts: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <title>@lazarv/react-server</title>
        <meta charSet="utf-8" />
      </head>
      <body className="flex flex-col h-screen bg-gradient-to-b from-blue-100 to-purple-100">
        <App outlets={outlets} />
        {children}
      </body>
    </html>
  );
}
