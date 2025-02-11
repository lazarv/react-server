"use client";

import Button, { type ButtonProps } from "~/components/Button";

export default function Confetti(props: ButtonProps) {
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
