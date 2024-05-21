"use client";

import ClickAwayListener from "react-click-away-listener";

export default function ClickAway({ children }) {
  return (
    <ClickAwayListener onClickAway={() => console.log("click away!")}>
      {children}
    </ClickAwayListener>
  );
}
