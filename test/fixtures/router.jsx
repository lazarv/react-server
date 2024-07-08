import { Route } from "@lazarv/react-server/router";

export default function Router() {
  return (
    <>
      <Route path="/" exact>
        <div>Home</div>
      </Route>
      <Route path="/first">
        <div>First</div>
      </Route>
      <Route path="/second">
        <div>Second</div>
      </Route>
      <Route path="/third">
        <div>Third</div>
      </Route>
      <Route fallback>
        <div>Not Found</div>
      </Route>
    </>
  );
}
