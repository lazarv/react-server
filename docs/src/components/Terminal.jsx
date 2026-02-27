"use client";

import { useState, useEffect } from "react";
import styles from "./Terminal.module.css";

function detectOS() {
  if (typeof navigator === "undefined") return "mac";
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  if (/Mac/i.test(platform) || /Mac/i.test(ua)) return "mac";
  if (/Win/i.test(platform) || /Win/i.test(ua)) return "windows";
  return "linux";
}

/* ── macOS traffic-light dots ── */
function MacTitleBar({ title }) {
  return (
    <div className={styles.titlebarMac}>
      <div className={styles.macDots}>
        <span className={styles.macDotClose} />
        <span className={styles.macDotMinimize} />
        <span className={styles.macDotMaximize} />
      </div>
      <span className={styles.title}>{title}</span>
      <div className={styles.macDotsSpacer} />
    </div>
  );
}

/* ── Windows-style caption buttons ── */
function WindowsTitleBar({ title }) {
  return (
    <div className={styles.titlebarWindows}>
      <div className={styles.winLeft}>
        <svg
          className={styles.winIcon}
          viewBox="0 0 16 16"
          width="14"
          height="14"
        >
          <rect
            x="1"
            y="1"
            width="6"
            height="6"
            rx="0.5"
            fill="currentColor"
            opacity="0.8"
          />
          <rect
            x="9"
            y="1"
            width="6"
            height="6"
            rx="0.5"
            fill="currentColor"
            opacity="0.6"
          />
          <rect
            x="1"
            y="9"
            width="6"
            height="6"
            rx="0.5"
            fill="currentColor"
            opacity="0.6"
          />
          <rect
            x="9"
            y="9"
            width="6"
            height="6"
            rx="0.5"
            fill="currentColor"
            opacity="0.4"
          />
        </svg>
        <span className={styles.title}>{title}</span>
      </div>
      <div className={styles.winButtons}>
        <span className={styles.winBtn}>
          <svg viewBox="0 0 12 12" width="12" height="12">
            <rect y="5" width="12" height="1.5" rx="0.5" fill="currentColor" />
          </svg>
        </span>
        <span className={styles.winBtn}>
          <svg viewBox="0 0 12 12" width="12" height="12">
            <rect
              x="1.5"
              y="1.5"
              width="9"
              height="9"
              rx="1"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
            />
          </svg>
        </span>
        <span className={styles.winBtnClose}>
          <svg viewBox="0 0 12 12" width="12" height="12">
            <path
              d="M2 2l8 8M10 2l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </div>
    </div>
  );
}

/* ── Linux / Ubuntu-style (close/minimize/maximize on the left) ── */
function LinuxTitleBar({ title }) {
  return (
    <div className={styles.titlebarLinux}>
      <div className={styles.linuxButtons}>
        <span className={styles.linuxBtnClose}>
          <svg viewBox="0 0 12 12" width="8" height="8">
            <path
              d="M2 2l8 8M10 2l-8 8"
              stroke="white"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className={styles.linuxBtnMinimize}>
          <svg viewBox="0 0 12 12" width="8" height="8">
            <rect y="5" width="12" height="2" rx="0.5" fill="white" />
          </svg>
        </span>
        <span className={styles.linuxBtnMaximize}>
          <svg viewBox="0 0 12 12" width="8" height="8">
            <rect
              x="1"
              y="1"
              width="10"
              height="10"
              rx="1"
              stroke="white"
              strokeWidth="1.8"
              fill="none"
            />
          </svg>
        </span>
      </div>
      <span className={styles.title}>{title}</span>
      <div className={styles.linuxButtonsSpacer} />
    </div>
  );
}

export default function Terminal({ command, title = "Terminal", os: osProp }) {
  const [os, setOS] = useState("mac");

  useEffect(() => {
    // Allow ?os=windows|linux|mac query param for testing
    const params = new URLSearchParams(window.location.search);
    const override = params.get("os");
    if (osProp) {
      setOS(osProp);
    } else if (override && ["mac", "windows", "linux"].includes(override)) {
      setOS(override);
    } else {
      setOS(detectOS());
    }
  }, [osProp]);

  const TitleBar =
    os === "windows"
      ? WindowsTitleBar
      : os === "linux"
        ? LinuxTitleBar
        : MacTitleBar;

  const osClass =
    os === "mac"
      ? styles.mac
      : os === "windows"
        ? styles.windows
        : styles.linux;

  return (
    <div className={`${styles.window} ${osClass}`}>
      <TitleBar title={title} />
      <div className={styles.body}>
        <span className={styles.prompt}>$</span>{" "}
        <span className={styles.command}>{command}</span>
        <span className={styles.cursor} />
      </div>
    </div>
  );
}
