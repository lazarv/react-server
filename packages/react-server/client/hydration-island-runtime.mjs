export function flightStreamFromPayload(payload) {
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  writer.write(new TextEncoder().encode(payload));
  writer.close();
  return { readable: stream.readable };
}

export function shouldDeferHydrationStrategy(strategy) {
  const type = strategy?.type || "load";
  return type !== "load" && type !== "never";
}

function eachEvent(events, callback) {
  if (Array.isArray(events)) {
    for (const event of events) callback(event);
  } else if (typeof events === "string") {
    for (const event of events.split(",")) {
      const trimmed = event.trim();
      if (trimmed) callback(trimmed);
    }
  }
}

export function runHydrationStrategy(element, strategy, hydrate) {
  const type = strategy?.type || "load";
  if (type === "never") return;

  if (type === "idle") {
    const timeout = Number(strategy.timeout ?? 2000);
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(hydrate, { timeout });
    } else {
      setTimeout(hydrate, timeout);
    }
    return;
  }

  if (type === "visible" && typeof IntersectionObserver === "function") {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          hydrate();
        }
      },
      {
        rootMargin: strategy.rootMargin || "600px",
        threshold:
          typeof strategy.threshold === "undefined"
            ? 0
            : Number(strategy.threshold),
      }
    );
    observer.observe(element);
    return;
  }

  if (type === "interaction") {
    const defaults = ["pointerenter", "focusin", "pointerdown", "click"];
    const events = strategy.events ?? defaults;
    let done = false;
    const cleanup = [];
    const listener = () => {
      if (done) return;
      done = true;
      for (const remove of cleanup) remove();
      hydrate();
    };
    eachEvent(events, (event) => {
      element.addEventListener(event, listener, {
        capture: true,
        once: true,
        passive: true,
      });
      cleanup.push(() =>
        element.removeEventListener(event, listener, { capture: true })
      );
    });
    return;
  }

  if (type === "media" && strategy.query && typeof matchMedia === "function") {
    const media = matchMedia(strategy.query);
    if (media.matches) {
      hydrate();
      return;
    }
    const listener = () => {
      if (media.matches) {
        media.removeEventListener("change", listener);
        hydrate();
      }
    };
    media.addEventListener("change", listener);
    return;
  }

  hydrate();
}
