"use client";

import { useCopyToClipboard } from "@uidotdev/usehooks";
import { Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export default function CopyToClipboard() {
  const ref = useRef();
  const [, copyToClipboard] = useCopyToClipboard();
  const [copiedText, setCopiedText] = useState("");

  useEffect(() => {
    let mounted = true;

    if (copiedText) {
      setTimeout(() => {
        if (mounted) setCopiedText("");
      }, 1000);
    }

    return () => {
      mounted = false;
    };
  }, [copiedText]);

  return (
    <button
      ref={ref}
      onClick={() => {
        const code = ref.current.parentElement.querySelector("code");
        const text =
          code.classList.contains("language-sh") && code.textContent.split("\n")
            ? code.textContent
                .split("\n")
                .filter((line) => line.trim())
                .join(" \\\n")
                .trim()
            : code.textContent;
        setCopiedText(text);
        copyToClipboard(text);
      }}
      className="absolute right-2 bottom-2"
      aria-label="Copy to clipboard"
    >
      <Copy size={24} className="stroke-white" />
      {copiedText && (
        <div className="absolute p-1 text-xs text-white bg-black rounded-md top-0 right-0 fade-out">
          Copied!
        </div>
      )}
    </button>
  );
}
