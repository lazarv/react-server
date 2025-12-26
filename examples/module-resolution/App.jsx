import FeatherIcons from "./components/FeatherIcons.jsx";
import InterweaveDemo from "./components/InterweaveDemo.jsx";
import IronSessionDemo from "./components/IronSessionDemo.jsx";
import ModalDemo from "./components/ModalDemo.jsx";
import ShikiDemo from "./components/ShikiDemo.jsx";

export default function App() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <title>Module Resolution Test</title>
      </head>
      <body suppressHydrationWarning>
        <h1>Module Resolution Test</h1>
        <div id="iron-session">
          <h2>iron-session</h2>
          <IronSessionDemo />
        </div>
        <div id="shiki">
          <h2>shiki</h2>
          <ShikiDemo />
        </div>
        <div id="react-modal">
          <h2>react-modal</h2>
          <ModalDemo />
        </div>
        <div id="interweave">
          <h2>interweave</h2>
          <InterweaveDemo />
        </div>
        <div id="react-feather">
          <h2>react-feather</h2>
          <FeatherIcons />
        </div>
      </body>
    </html>
  );
}
