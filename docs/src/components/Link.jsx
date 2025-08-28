"use client";

import { Link as LinkIcon } from "lucide-react";

import { scrollHashIntoView } from "./utils.mjs";

export default function Link({ name, children }) {
  return (
    <button
      className="flex items-baseline group cursor-pointer text-left"
      onClick={() => scrollHashIntoView(`#${name}`)}
    >
      <span id={name} className="relative -top-32 lg:-top-20"></span>
      {children}
      <a
        href={`#${name}`}
        className="text-2xl ml-2 [h4+&]:text-lg [h4+&]:ml-1 [h3+&]:text-lg [h3+&]:ml-1 transition-opacity duration-200 opacity-0 group-hover:opacity-100"
        onClick={(e) => {
          e.preventDefault();
          scrollHashIntoView(`#${name}`);
        }}
      >
        <LinkIcon size={16} />
      </a>
    </button>
  );
}
