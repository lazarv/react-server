import "./global.css";
export default function Layout({ children }: React.PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>AWS Deploy App</title>
      </head>
      <body>
        <div className="p-4">
          <h1 className="text-4xl font-bold mb-4">
            <a href="/">AWS Deploy App</a>
          </h1>
          {children}
        </div>
      </body>
    </html>
  );
}
