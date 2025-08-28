"use client";

import {
  Component,
  createContext,
  createElement,
  isValidElement,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  FlightContext,
  FlightComponentContext,
  useClient,
  PAGE_ROOT,
} from "./context.mjs";

const ErrorBoundaryContext = createContext(null);

export function useErrorBoundary() {
  const context = useContext(ErrorBoundaryContext);

  const [state, setState] = useState({
    error: null,
    hasError: false,
  });

  const memoized = useMemo(
    () => ({
      resetBoundary: () => {
        context.resetErrorBoundary();
        setState({ error: null, hasError: false });
      },
      showBoundary: (error) =>
        setState({
          error,
          hasError: true,
        }),
    }),
    [context.resetErrorBoundary]
  );

  if (state.hasError) {
    throw state.error;
  }

  return memoized;
}

const initialState = {
  didCatch: false,
  error: null,
};

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);

    this.resetErrorBoundary = this.resetErrorBoundary.bind(this);
    this.state = initialState;
  }

  static getDerivedStateFromError(error) {
    return { didCatch: true, error };
  }

  async resetErrorBoundary(...args) {
    const { error } = this.state;

    if (error !== null) {
      await this.props.onReset?.({
        args,
        reason: "imperative-api",
        error,
        resetErrorBoundary: this.resetErrorBoundary,
      });

      if (typeof error?.digest !== "string") {
        this.setState(initialState);
      }
    }
  }

  componentDidCatch(error, info) {
    this.props.onError?.(error, info);
  }

  componentDidUpdate(prevProps, prevState) {
    const { didCatch } = this.state;
    const { resetKeys } = this.props;

    // There's an edge case where if the thing that triggered the error happens to *also* be in the resetKeys array,
    // we'd end up resetting the error boundary immediately.
    // This would likely trigger a second error to be thrown.
    // So we make sure that we don't check the resetKeys on the first call of cDU after the error is set.

    if (
      didCatch &&
      prevState.error !== null &&
      hasArrayChanged(prevProps.resetKeys, resetKeys)
    ) {
      if (typeof this.props.onReset === "function") {
        const resetPromise = this.props.onReset({
          next: resetKeys,
          prev: prevProps.resetKeys,
          reason: "keys",
        });

        if (typeof resetPromise?.then === "function") {
          resetPromise.then(() => {
            this.setState(initialState);
          });
        } else {
          this.setState(initialState);
        }
      } else {
        this.setState(initialState);
      }
    }
  }

  render() {
    const { children, fallbackRender, FallbackComponent, fallback } =
      this.props;
    const { didCatch, error } = this.state;

    if (
      error?.message === "Redirect" &&
      error?.digest.startsWith("Location=")
    ) {
      error.redirectTo = error.digest.slice(9);
    }

    let childToRender = children;

    if (didCatch) {
      const props = {
        error,
        resetErrorBoundary: this.resetErrorBoundary,
      };

      if (!import.meta.env.DEV) {
        delete error.stack;
      }

      if (typeof fallbackRender === "function") {
        childToRender = fallbackRender(props);
      } else if (FallbackComponent) {
        childToRender = createElement(FallbackComponent, props);
      } else if (fallback === null || isValidElement(fallback)) {
        childToRender = fallback;
      } else {
        if (import.meta.env.DEV) {
          console.error(
            "react-error-boundary requires either a fallback, fallbackRender, or FallbackComponent prop"
          );
        }

        throw error;
      }
    }

    return (
      <ErrorBoundaryContext.Provider
        value={{
          didCatch,
          error,
          resetErrorBoundary: this.resetErrorBoundary,
        }}
      >
        {childToRender}
      </ErrorBoundaryContext.Provider>
    );
  }
}

function hasArrayChanged(a = [], b = []) {
  return (
    a.length !== b.length || a.some((item, index) => !Object.is(item, b[index]))
  );
}

function FallbackRenderComponent({
  FallbackComponent,
  fallbackRender,
  ...props
}) {
  const { outlet } = useContext(FlightContext);
  const client = useClient();
  const { navigate } = client;
  const { error } = props;
  const { redirectTo } = error;

  useEffect(() => {
    if (redirectTo) {
      navigate(redirectTo, { outlet, external: outlet !== PAGE_ROOT });
    }
  }, [redirectTo, navigate, outlet]);

  if (redirectTo) {
    return null;
  }

  return (
    <>
      {FallbackComponent && typeof FallbackComponent === "function" ? (
        <FallbackComponent {...props} />
      ) : (
        FallbackComponent
      )}
      {fallbackRender?.(props)}
    </>
  );
}

function ThrowError({ error }) {
  if (error) {
    throw error;
  }
  return null;
}

export default function ReactServerOutletErrorBoundary({
  component: FallbackComponent,
  render: fallbackRender,
  onReset,
  global,
  children,
  ...props
}) {
  const { outlet } = useContext(FlightContext);
  const { resourceKey, error } = useContext(FlightComponentContext);
  const { invalidate } = useClient();

  return (
    <ErrorBoundary
      key={`${outlet}_${resourceKey}`}
      {...props}
      onReset={async (details) => {
        if (typeof details.error?.digest === "string") {
          await invalidate(outlet);
        }
        onReset?.(details);
      }}
      fallbackRender={(props) => (
        <FallbackRenderComponent
          FallbackComponent={FallbackComponent}
          fallbackRender={fallbackRender}
          {...props}
        />
      )}
    >
      <ThrowError error={error} />
      {children}
    </ErrorBoundary>
  );
}
