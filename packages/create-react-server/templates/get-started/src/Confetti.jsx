"use client";

import Button from "./Button";

export default function Confetti(props) {
  return (
    <Button
      {...props}
      onClick={async () => {
        const { default: confetti } = await import(
          "https://esm.sh/canvas-confetti"
        );
        confetti();
      }}
    >
      Celebrate!
    </Button>
  );
}
