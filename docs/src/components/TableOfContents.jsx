"use client";

import { useEffect, useState } from "react";

export default function TableOfContents() {
  const [tableOfContents, setTableOfContents] = useState([]);
  const [active, setActive] = useState("");

  useEffect(() => {
    const tableOfContents = Array.from(
      document.querySelectorAll("article h1, article a[href^='#']")
    ).map((element) => ({
      label:
        element.tagName === "H1"
          ? element.textContent
          : element.parentElement.textContent.replace("#", "").trim(),
      href: element.getAttribute("href") ?? "#",
      el: element.tagName === "H1" ? element : element.parentElement,
    }));

    setTableOfContents(tableOfContents);

    const sections = [];
    let sectionRatio = [];
    const elementRatio = new WeakMap();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const el = entry.target;
          const i = sections.findIndex((section) => section.includes(el));
          elementRatio.set(el, entry.intersectionRatio);
          if (i === -1) return;
          sectionRatio[i] =
            sections[i].reduce((acc, el) => acc + elementRatio.get(el), 0) /
            sections[i].length;
        });

        const activeSection = sectionRatio.reduce((index, ratio, i) => {
          if (ratio === 1 && i === sectionRatio.length - 1) return i;
          if (ratio > sectionRatio[index]) return i;
          return index;
        }, 0);

        setActive(tableOfContents[activeSection].href);
      },
      { threshold: [0.1, 0.5, 1] }
    );

    Array.from(document.querySelector("article").children).forEach((el) => {
      if (tableOfContents.some((item) => item.el === el)) {
        sections.push([]);
      }
      sections[sections.length - 1].push(el);
      elementRatio.set(el, 0);
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
                (
                  item.href === "#"
                    ? active === "#"
                    : active?.includes(item.href)
                )
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
