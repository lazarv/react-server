"use client";

import React, {
  Suspense,
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import ReactServerComponent from "./ReactServerComponent.jsx";
import { getHydrationIslandContent } from "./hydration-island-data.mjs";
import {
  flightStreamFromPayload,
  runHydrationStrategy,
  shouldDeferHydrationStrategy,
} from "./hydration-island-runtime.mjs";
import { activateScriptTemplates } from "./script-templates.mjs";

const resources = new Map();

function getResource(id) {
  let resource = resources.get(id);
  if (!resource) {
    let resolvePromise;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    resource = {
      promise,
      resolved: false,
      started: false,
      resolve() {
        if (resource.resolved) return;
        resource.resolved = true;
        resolvePromise();
      },
      start(element, strategy) {
        if (resource.started || resource.resolved) return;
        resource.started = true;
        runHydrationStrategy(element, strategy, resource.resolve);
      },
    };
    resources.set(id, resource);
  }
  return resource;
}

function HydrationIslandCommitEffect({ id }) {
  useEffect(() => {
    const markHydrated = () => {
      const states = (self.__react_server_hydration_island_states__ ??= {});
      states[id] = "hydrated";
    };
    if (typeof requestAnimationFrame === "function") {
      const frame = requestAnimationFrame(markHydrated);
      return () => cancelAnimationFrame(frame);
    }
    const timeout = setTimeout(markHydrated, 0);
    return () => clearTimeout(timeout);
  }, [id]);

  return null;
}

function HydrationIslandOutlet({ id, outlet, url, strategy, resource }) {
  if (shouldDeferHydrationStrategy(strategy)) {
    use(resource.promise);
  }

  return (
    <>
      <ReactServerComponent outlet={outlet} island={true} url={url} />
      <HydrationIslandCommitEffect id={id} />
    </>
  );
}

function readHydrationIslandData(cacheKey) {
  const data = getHydrationIslandContent(cacheKey);
  return data && typeof data.then === "function" ? use(data) : data;
}

function HydrationIslandContent({ data }) {
  return data?.content ?? null;
}

export default function HydrationIslandBoundary({
  id,
  outlet = id,
  url,
  strategy = { type: "load" },
  cacheKey,
}) {
  const elementRef = useRef(null);
  const [active, setActive] = useState(false);
  const resource = useMemo(() => getResource(id), [id]);
  const hydrationData = readHydrationIslandData(cacheKey);

  useEffect(() => {
    const data = {
      id,
      outlet,
      url,
      strategy,
    };
    const states = (self.__react_server_hydration_island_states__ ??= {});
    (self.__react_server_hydration_islands__ ??= {})[id] = data;

    if (strategy?.type === "never") {
      return;
    }

    activateScriptTemplates(document);
    self.__react_server_hydrate_islands__?.();

    if (hydrationData?.payload && !self[`__flightStream__${outlet}__`]) {
      self[`__flightStream__${outlet}__`] = flightStreamFromPayload(
        hydrationData.payload
      );
    }

    if (!self[`__flightStream__${outlet}__`]) {
      return;
    }

    self[`__flightHydration__${outlet}__`] = false;

    if (shouldDeferHydrationStrategy(strategy)) {
      states[id] = states[id] || "scheduled";
      resource.start(elementRef.current, strategy);
    } else {
      states[id] = "hydrating";
      resource.resolve();
    }

    setActive(true);
  }, [id, outlet, url, strategy, resource, hydrationData]);

  return (
    <div
      ref={elementRef}
      data-react-server-hydration-island={id}
      data-react-server-outlet={outlet}
      data-react-server-strategy={JSON.stringify(strategy)}
      suppressHydrationWarning
    >
      {active ? (
        <Suspense fallback={<HydrationIslandContent data={hydrationData} />}>
          <HydrationIslandOutlet
            id={id}
            outlet={outlet}
            url={url}
            strategy={strategy}
            resource={resource}
          />
        </Suspense>
      ) : (
        <HydrationIslandContent data={hydrationData} />
      )}
    </div>
  );
}
