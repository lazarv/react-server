"use client";

import Form from "./Form.jsx";
import Link from "./Link.jsx";
import ReactServerComponent from "./ReactServerComponent.jsx";
import Refresh from "./Refresh.jsx";

export * from "./location.mjs";
export { useMatch } from "./client-location.mjs";
export {
  redirect,
  RedirectError,
  useNavigationGuard,
} from "./client-navigation.mjs";
export { RedirectBoundary } from "./RedirectBoundary.jsx";
export {
  ScrollRestoration,
  registerScrollContainer,
  unregisterScrollContainer,
  useScrollContainer,
  useScrollPosition,
} from "./ScrollRestoration.jsx";
export {
  useRouteParams,
  useRouteMatch,
  useRouteSearchParams,
} from "./typed-route-hooks.mjs";

import { useClient } from "./context.mjs";

export function useNavigate() {
  const { navigate } = useClient();
  return navigate;
}

export { Form, Link, ReactServerComponent, Refresh };
