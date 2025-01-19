"use client";

import { useEffect, useRef } from "react";

import { useClient } from "@lazarv/react-server/client";

import classes from "./Modal.module.css";

export default function Modal({ children }: { children: React.ReactNode }) {
  const { navigate } = useClient();
  const contentRef = useRef<HTMLDivElement>(null);
  const closableRef = useRef(false);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          content.classList.remove(classes.closing);
        }
      }
    });

    observer.observe(content, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const abortController = new AbortController();

    contentRef.current?.addEventListener(
      "transitionend",
      () => {
        if (!contentRef.current?.classList.contains(classes.closing)) {
          closableRef.current = true;
        }
      },
      { signal: abortController.signal }
    );

    return () => abortController.abort();
  }, [contentRef.current]);

  const closeModal = async () => {
    if (!closableRef.current) return;

    await new Promise((resolve) => {
      contentRef.current?.addEventListener("transitionend", resolve, {
        once: true,
      });
      contentRef.current?.classList.add(classes.closing);
      closableRef.current = false;
    });
    navigate("/", {
      outlet: "modal",
      Component: null,
    });
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") closeModal();
  };

  useEffect(() => {
    const abortController = new AbortController();

    document.addEventListener("keydown", handleKeyDown, {
      signal: abortController.signal,
    });

    return () => abortController.abort();
  }, []);

  return (
    <>
      <div ref={contentRef} className={`hidden ${classes.content}`}>
        {children}
      </div>
      <div
        className={classes.overlay}
        onClick={closeModal}
        onKeyDown={(e) => handleKeyDown(e.nativeEvent)}
        role="button"
        tabIndex={-1}
      />
    </>
  );
}
