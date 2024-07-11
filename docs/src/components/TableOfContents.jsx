"use client";

import { useEffect, useState } from "react";

export default function TableOfContents() {
  const [tableOfContents, setTableOfContents] = useState([]);
  const [active, setActive] = useState("");

  useEffect(() => {
    const tableOfContents = Array.from(
      document.querySelectorAll("h1,a[href^='#']")
    ).map((element) => ({
      label:
        element.tagName === "H1"
          ? element.textContent
          : element.parentElement.textContent.replace("#", "").trim(),
      href: element.getAttribute("href") ?? "#",
      el: element,
    }));

    setTableOfContents(tableOfContents);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.href);
          }
        }
      },
      { rootMargin: "0% 0% -90% 0%" }
    );

    tableOfContents.forEach(({ el }) => {
      observer.observe(el);
    });

    const handleHashChange = () => {
      setActive(window.location.hash);
    };

    window.addEventListener("hashchange", handleHashChange);

    return () => {
      observer.disconnect();
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  return (
    <>
      <ul>
        {tableOfContents.map((item, i) => (
          <li key={item.href}>
            <a
              href={item.href}
              className={`block mb-1 text-sm${
                (item.href === "#" ? !active : active?.includes(item.href))
                  ? " text-indigo-500 dark:text-yellow-600 active"
                  : ""
              }`}
            >
              {i + 1}. {item.label}
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
