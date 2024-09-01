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

import { FlightContext, useClient } from "./context.mjs";

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

  resetErrorBoundary(...args) {
    const { error } = this.state;

    if (error !== null) {
      this.props.onReset?.({
        args,
        reason: "imperative-api",
      });

      this.setState(initialState);
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
      this.props.onReset?.({
        next: resetKeys,
        prev: prevProps.resetKeys,
        reason: "keys",
      });

      this.setState(initialState);
    }
  }

  render() {
    const { children, fallbackRender, FallbackComponent, fallback } =
      this.props;
    const { didCatch, error } = this.state;

    let childToRender = children;

    if (didCatch) {
      const props = {
        error,
        resetErrorBoundary: this.resetErrorBoundary,
      };

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

function ResetErrorBoundary() {
  const { url, outlet } = useContext(FlightContext);
  const { resetBoundary } = useErrorBoundary();
  const { subscribe } = useClient();

  useEffect(() => {
    return subscribe(outlet || url, () => resetBoundary());
  }, []);

  return null;
}

export default function ReactServerErrorBoundary({
  component: FallbackComponent,
  render: fallbackRender,
  children,
  ...props
}) {
  return (
    <ErrorBoundary
      {...props}
      fallbackRender={(props) => (
        <>
          <ResetErrorBoundary />
          {FallbackComponent && typeof FallbackComponent === "function" ? (
            <FallbackComponent {...props} />
          ) : (
            FallbackComponent
          )}
          {fallbackRender?.(props)}
        </>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
