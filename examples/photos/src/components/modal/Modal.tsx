"use client";

import { useEffect } from "react";
import ClickAwayListener from "react-click-away-listener";

export default function Modal({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.body.classList.add("overflow-hidden");
    return () => document.body.classList.remove("overflow-hidden");
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        history.back();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="fixed z-10 left-0 right-0 top-0 bottom-0 mx-auto bg-black/60">
      <ClickAwayListener onClickAway={() => history.back()}>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl sm:w-10/12 md:w-8/12 lg:w-1/2 p-6">
          {children}
        </div>
      </ClickAwayListener>
    </div>
  );
}
