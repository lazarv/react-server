import { ReactServerComponent } from "@lazarv/react-server/navigation";
import { Route } from "@lazarv/react-server/router";
import Home from "~/app/@content";
import About from "~/app/@content/about";

export default function Page() {
  return (
    <ReactServerComponent outlet="content">
      <Route path="/" exact>
        <Home />
      </Route>
      <Route path="/about" exact>
        <About />
      </Route>
    </ReactServerComponent>
  );
}
