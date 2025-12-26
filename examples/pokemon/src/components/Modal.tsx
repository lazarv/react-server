"use client";

import { useCallback, useEffect, useRef } from "react";

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
    const content = contentRef.current;

    content?.addEventListener(
      "transitionend",
      () => {
        if (!contentRef.current?.classList.contains(classes.closing)) {
          closableRef.current = true;
        }
      },
      { signal: abortController.signal }
    );

    return () => abortController.abort();
  }, []);

  const closeModal = useCallback(async () => {
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
  }, [navigate]);

  useEffect(() => {
    const abortController = new AbortController();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeModal();
    };

    document.addEventListener("keydown", handleKeyDown, {
      signal: abortController.signal,
    });

    return () => abortController.abort();
  }, [closeModal]);

  return (
    <>
      <div ref={contentRef} className={`hidden ${classes.content}`}>
        {children}
      </div>
      <button
        type="button"
        className={classes.overlay}
        onClick={closeModal}
        aria-label="Close modal"
      />
    </>
  );
}
