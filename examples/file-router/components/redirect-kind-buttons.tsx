"use client";

import { useState } from "react";

import {
  redirectNavigate,
  redirectPush,
  redirectLocation,
  redirectLocationExternal,
  redirectError,
} from "../redirect-actions";

export default function RedirectKindButtons() {
  const [result, setResult] = useState<string | null>(null);

  return (
    <div>
      <button
        data-testid="redirect-navigate"
        onClick={async () => {
          await redirectNavigate();
        }}
      >
        Navigate (default)
      </button>
      <br />
      <button
        data-testid="redirect-push"
        onClick={async () => {
          await redirectPush();
        }}
      >
        Push (pushState)
      </button>
      <br />
      <button
        data-testid="redirect-location"
        onClick={async () => {
          await redirectLocation();
        }}
      >
        Location (full browser navigation)
      </button>
      <br />
      <button
        data-testid="redirect-location-external"
        onClick={async () => {
          await redirectLocationExternal();
        }}
      >
        Location External
      </button>
      <br />
      <button
        data-testid="redirect-error"
        onClick={async () => {
          try {
            await redirectError();
          } catch (e: any) {
            if (e?.digest?.startsWith("Location=")) {
              const url = e.digest.split("Location=")[1]?.split(";")[0];
              setResult(`Caught redirect to: ${url}`);
            } else {
              setResult(`Unexpected error: ${e.message}`);
            }
          }
        }}
      >
        Error (try/catch)
      </button>
      {result && <p data-testid="redirect-error-result">{result}</p>}
    </div>
  );
}
