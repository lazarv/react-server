import ErrorBoundary from "@lazarv/react-server/error-boundary";
import { Route } from "@lazarv/react-server/router";

import ErrorMessage from "./error-message";

async function ThrowError() {
  throw new Error("test");
}

export default function ErrorBoundaryFixture() {
  return (
    <html lang="en">
      <body>
        <Route path="/error-boundary" exact>
          <ErrorBoundary
            fallback={<h1 data-testid="loading">Loading...</h1>}
            component={
              <h1 data-testid="error-message">Uh oh, something went wrong!</h1>
            }
            render={ErrorMessage}
          >
            <ThrowError />
          </ErrorBoundary>
        </Route>
        <Route path="/throw-error" exact>
          <ThrowError />
        </Route>
      </body>
    </html>
  );
}
