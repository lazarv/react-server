"use client";

import { useEffect, useState } from "react";

if (typeof window !== "undefined") {
  window.__react_server_visible_client_loader_module_loads__ =
    (window.__react_server_visible_client_loader_module_loads__ ?? 0) + 1;
}

export default function VisibilityLoadedClient() {
  const [enabled, setEnabled] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    window.__react_server_visible_client_loader_hydrated__ = true;
    setHydrated(true);
  }, []);

  return (
    <section className="island-panel" data-testid="visible-client-loader">
      <div>
        <p className="eyebrow">Visibility client</p>
        <h2>Client loaded on hydration</h2>
        <p data-testid="visible-client-loader-status">
          {hydrated
            ? "The client module loaded after the island became visible."
            : "This client component is server-rendered HTML for now."}
        </p>
      </div>
      <button type="button" onClick={() => setEnabled((value) => !value)}>
        {enabled ? "Enabled" : "Enable"}
      </button>
    </section>
  );
}
