import "./global.css";

import { ReactServerComponent } from "@lazarv/react-server/navigation";

import GithubCorner from "../components/github-corner/GithubCorner";

export default function Layout({
  modal,
  children,
}: React.PropsWithChildren<{
  modal: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>Photos</title>
        <meta
          name="description"
          content="A sample app showing dynamic routing with modals as a route."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <GithubCorner />
        {children}
        <ReactServerComponent outlet="modal">{modal}</ReactServerComponent>
      </body>
    </html>
  );
}
