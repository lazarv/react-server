import {
  Component,
  ComponentType,
  ErrorInfo,
  FunctionComponent,
  PropsWithChildren,
  ReactElement,
  ReactNode,
} from "react";

declare function FallbackRender(props: FallbackProps): ReactNode;

export type FallbackProps = {
  error: any;
  resetErrorBoundary: (...args: any[]) => void;
};

type ErrorBoundarySharedProps = PropsWithChildren<{
  onError?: (error: Error, info: ErrorInfo) => void;
  onReset?: (
    details:
      | { reason: "imperative-api"; args: any[] }
      | { reason: "keys"; prev: any[] | undefined; next: any[] | undefined }
  ) => void;
  resetKeys?: any[];
}>;

export type ErrorBoundaryPropsWithComponent = ErrorBoundarySharedProps & {
  fallback?: never;
  FallbackComponent: ComponentType<FallbackProps>;
  fallbackRender?: never;
};

export type ErrorBoundaryPropsWithRender = ErrorBoundarySharedProps & {
  fallback?: never;
  FallbackComponent?: never;
  fallbackRender: typeof FallbackRender;
};

export type ErrorBoundaryPropsWithFallback = ErrorBoundarySharedProps & {
  fallback: ReactElement<
    unknown,
    string | FunctionComponent | typeof Component
  > | null;
  FallbackComponent?: never;
  fallbackRender?: never;
};

export type ErrorBoundaryProps =
  | ErrorBoundaryPropsWithFallback
  | ErrorBoundaryPropsWithComponent
  | ErrorBoundaryPropsWithRender;

export type ErrorBoundaryComponentProps = React.PropsWithChildren<{
  error: Error & { digest?: string };
  resetErrorBoundary: () => void;
}>;

export type ReactServerErrorBoundaryProps = React.PropsWithChildren<
  Omit<ErrorBoundaryProps, "fallback"> & {
    fallback?: React.ReactNode;
    component?:
      | React.ComponentType<ErrorBoundaryComponentProps>
      | React.ReactNode;
  }
>;

/**
 * This component is used to catch errors in the component tree below and display a fallback UI.
 *
 * @param props - The props for the ErrorBoundary component
 *
 * @example
 *
 * ```tsx
 * import { ErrorBoundary } from '@lazarv/react-server/error-boundary';
 *
 * export default function App() {
 *  return (
 *   <ErrorBoundary fallback={<h1>Something went wrong.</h1>}>
 *    <MyComponent />
 *   </ErrorBoundary>
 *  );
 * }
 * ```
 */
declare const ErrorBoundary: React.FC<ReactServerErrorBoundaryProps>;
export default ErrorBoundary;
