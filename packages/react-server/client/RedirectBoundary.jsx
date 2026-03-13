"use client";

import { Component, createElement, useEffect, useRef } from "react";

import { useClient } from "./context.mjs";
import { RedirectError } from "./client-navigation.mjs";
import { usePathname } from "./client-location.mjs";

/**
 * Inner function component that performs the redirect using the
 * full navigation system (useClient().navigate).
 *
 * Does NOT auto-reset the boundary after navigating — this prevents an
 * infinite loop when the component is preserved via Activity (hidden mode
 * still renders children). Instead, it watches the pathname and resets
 * when the user navigates back to this route, giving the child component
 * another chance to render (and redirect again if needed).
 */
function RedirectHandler({ error, reset }) {
  const { navigate } = useClient();
  const pathname = usePathname();
  const didNavigate = useRef(false);

  // Perform the redirect once
  useEffect(() => {
    const url = new URL(error.url, location.origin);
    if (url.origin === location.origin) {
      navigate(error.url, { push: !error.replace });
    } else {
      if (error.replace) {
        location.replace(error.url);
      } else {
        location.href = error.url;
      }
    }
    didNavigate.current = true;
  }, [error, navigate]);

  // Reset the boundary when the user navigates back to this route.
  // After redirect, pathname equals the redirect target (e.g. "/").
  // When the user later navigates to the original route, pathname changes
  // away from the target — that's our signal to reset and try again.
  useEffect(() => {
    if (didNavigate.current) {
      const target = new URL(error.url, location.origin).pathname;
      if (pathname !== target) {
        reset();
      }
    }
  }, [pathname, error.url, reset]);

  return null;
}

/**
 * Error boundary that catches RedirectError thrown by client-side redirect().
 * Uses the proper navigation system to perform the redirect.
 *
 * Automatically wrapped around route content by ClientRouteRegistration
 * and ClientRouteGuard — you don't need to use this directly.
 */
export class RedirectBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { redirectError: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    if (error instanceof RedirectError) {
      return { redirectError: error };
    }
    // Re-throw non-redirect errors so they propagate to the outer ErrorBoundary
    throw error;
  }

  reset() {
    this.setState({ redirectError: null });
  }

  render() {
    if (this.state.redirectError) {
      return createElement(RedirectHandler, {
        error: this.state.redirectError,
        reset: this.reset,
      });
    }
    return this.props.children;
  }
}
