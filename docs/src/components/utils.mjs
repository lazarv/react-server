export function scrollHashIntoView(hash) {
  if (hash === "#") {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  } else {
    document.querySelector(hash)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  history.pushState(null, "", hash);
}
