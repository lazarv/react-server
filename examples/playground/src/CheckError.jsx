"use client";

import { Refresh } from "@lazarv/react-server/navigation";

export default function CheckError({ error, children }) {
  return (
    <div>
      Is there an error?
      {error && (
        <>
          {" "}
          <span style={{ color: "red" }}>YES!</span>
          <pre>{error.stack}</pre>
          <Refresh>
            <button>Try again</button>
          </Refresh>
        </>
      )}{" "}
      {children}
    </div>
  );
}
