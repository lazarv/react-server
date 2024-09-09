// In Next.js, this file would be called: app/layout.jsx
// import Counter from "./counter";
import "./comments.css";
import "./posts.css";

import Providers from "./providers";

// import Providers from "./test";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head />
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
