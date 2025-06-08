"use client";

import { useData } from "./DataProvider.jsx";

export default function Context({ children }) {
  const { message } = useData();

  return (
    <div>
      <p>{message}</p>
      <p>
        This component uses a context provider to access data. The data is
        provided by the DataProvider component.
      </p>
      {children}
    </div>
  );
}
