import { useUrl, useSearchParams } from "@lazarv/react-server";
import { Link, Refresh } from "@lazarv/react-server/navigation";
import Counter from "./Counter.jsx";
import RootClient from "./RootClient.jsx";
import StrategyProbe from "./StrategyProbe.jsx";
import VisibilityLoadedClient from "./VisibilityLoadedClient.jsx";

function CounterIsland() {
  "use hydrate: idle; timeout=1200; id=counter";

  return <Counter initial={7} title="Idle counter" />;
}

function VisibleCounterIsland() {
  "use hydrate: visible; rootMargin=0px; threshold=0.2; id=visible_counter";

  return <Counter initial={21} title="Visible counter" />;
}

function VisibleClientLoadIsland() {
  "use hydrate: visible; rootMargin=0px; threshold=0.2; id=visible_client_loader";

  return <VisibilityLoadedClient />;
}

function MixedCounterIsland() {
  "use hydrate: load; id=mixed_counter";

  return <Counter initial={31} title="Mixed root counter" />;
}

function MixedVisibleClientLoadIsland() {
  "use hydrate: visible; rootMargin=0px; threshold=0.2; id=mixed_visible_client_loader";

  return <VisibilityLoadedClient />;
}

function LateCounterIsland() {
  "use hydrate: load; id=late_counter";

  return <Counter initial={41} title="Navigation island" />;
}

function RscNavigationIsland() {
  "use hydrate: load; id=rsc_navigation";

  const url = useUrl();
  const search = useSearchParams();
  const rawView = Array.isArray(search?.view) ? search.view[0] : search?.view;
  const view = rawView === "details" ? "details" : "overview";
  const outletUrl = `${url.pathname}${url.search}`;
  const renderId = Date.now().toString(36);

  return (
    <section className="rsc-panel" data-testid="rsc-island" data-view={view}>
      <div>
        <p className="eyebrow">RSC island</p>
        <h2>Outlet navigation</h2>
        <p data-testid="rsc-view">
          {view === "details"
            ? "Details view rendered by the island outlet."
            : "Overview view rendered by the island outlet."}
        </p>
        <p className="meta" data-testid="rsc-path">
          {outletUrl}
        </p>
        <p className="meta" data-testid="rsc-render-id">
          {renderId}
        </p>
      </div>
      <nav className="rsc-actions" aria-label="RSC island navigation">
        <Link local to="/?view=overview" data-testid="rsc-overview-link">
          Overview
        </Link>
        <Link local to="/?view=details" data-testid="rsc-details-link">
          Details
        </Link>
        <Refresh local noCache data-testid="rsc-refresh-link">
          Refresh island
        </Refresh>
      </nav>
    </section>
  );
}

function LoadStrategyIsland() {
  "use hydrate: load; id=strategy_load";

  return <StrategyProbe name="load" initial={1} title="Load strategy" />;
}

function IdleStrategyIsland() {
  "use hydrate: idle; timeout=50; id=strategy_idle";

  return <StrategyProbe name="idle" initial={2} title="Idle strategy" />;
}

function VisibleStrategyIsland() {
  "use hydrate: visible; rootMargin=0px; threshold=0.2; id=strategy_visible";

  return <StrategyProbe name="visible" initial={3} title="Visible strategy" />;
}

function InteractionStrategyIsland() {
  "use hydrate: interaction; events=pointerenter; id=strategy_interaction";

  return (
    <StrategyProbe
      name="interaction"
      initial={4}
      title="Interaction strategy"
    />
  );
}

function MediaStrategyIsland() {
  "use hydrate: media; query=(min-width: 700px); id=strategy_media";

  return <StrategyProbe name="media" initial={5} title="Media strategy" />;
}

function NeverStrategyIsland() {
  "use hydrate: never; id=strategy_never";

  return <StrategyProbe name="never" initial={6} title="Never strategy" />;
}

function searchValue(search, key) {
  const value = search?.[key];
  return Array.isArray(value) ? value[0] : value;
}

export default function App() {
  const search = useSearchParams();
  const mode = searchValue(search, "mode") || "rootless";
  const mixed = mode === "mixed";
  const lateEmpty = mode === "late-empty";
  const lateIsland = mode === "late-island";
  const strategies = mode === "strategies";

  return (
    <html lang="en">
      <head>
        <title>Hydration Islands</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`
          :root {
            color-scheme: light;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background: #f5f7fb;
            color: #172033;
          }

          body {
            margin: 0;
          }

          main {
            width: min(880px, calc(100vw - 40px));
            margin: 0 auto;
            padding: 56px 0;
          }

          h1 {
            margin: 0 0 12px;
            font-size: 40px;
            line-height: 1.05;
          }

          p {
            margin: 0;
            color: #526071;
            line-height: 1.6;
          }

          .shell {
            display: grid;
            gap: 28px;
          }

          .server-panel,
          .client-panel,
          .observer-panel,
          .rsc-panel,
          .island-panel,
          .strategy-panel {
            border: 1px solid #d9e1ee;
            border-radius: 8px;
            background: #fff;
            box-shadow: 0 10px 30px rgb(23 32 51 / 8%);
          }

          .server-panel {
            padding: 24px;
          }

          .client-panel {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 20px;
            padding: 24px;
          }

          .rsc-panel {
            display: grid;
            gap: 20px;
            padding: 24px;
          }

          .strategy-panel {
            display: grid;
            gap: 18px;
            padding: 24px;
          }

          .strategy-list {
            display: grid;
            gap: 18px;
          }

          .strategy-viewport-target {
            min-height: 110vh;
            display: grid;
            align-items: end;
          }

          .meta {
            margin-top: 8px;
            color: #7c8797;
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            font-size: 13px;
          }

          .rsc-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
          }

          .rsc-actions a {
            border: 1px solid #cad5e5;
            border-radius: 6px;
            color: #172033;
            font-weight: 700;
            padding: 10px 12px;
            text-decoration: none;
          }

          .rsc-actions a:hover {
            border-color: #2563eb;
            color: #2563eb;
          }

          .observer-panel {
            min-height: 86vh;
            display: grid;
            align-items: end;
            padding: 24px;
          }

          .client-loader-panel {
            min-height: 120vh;
          }

          .observer-panel > div {
            display: grid;
            gap: 20px;
          }

          .island-panel {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 20px;
            padding: 24px;
          }

          .eyebrow {
            margin: 0 0 8px;
            color: #2563eb;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: .08em;
            text-transform: uppercase;
          }

          h2 {
            margin: 0 0 8px;
            font-size: 22px;
          }

          button {
            min-width: 120px;
            border: 0;
            border-radius: 6px;
            background: #172033;
            color: #fff;
            cursor: pointer;
            font: inherit;
            font-weight: 700;
            padding: 12px 16px;
          }

          button:hover {
            background: #2563eb;
          }

          @media (max-width: 640px) {
            .island-panel {
              align-items: stretch;
              flex-direction: column;
            }

            .client-panel {
              align-items: stretch;
              flex-direction: column;
            }

            button {
              width: 100%;
            }
          }
        `}</style>
      </head>
      <body>
        <main className="shell">
          <section>
            <h1>Static root, hydrated island</h1>
            <p>
              The page root has no client component. The counter below is
              rendered into HTML and hydrated later as a non-root outlet.
            </p>
          </section>
          <section className="server-panel">
            <p className="eyebrow">Server-only root</p>
            <p>
              {mixed || lateEmpty || lateIsland
                ? "This page also hydrates the page root. The island below still hydrates as a local outlet."
                : strategies
                  ? "This strategy fixture keeps the page root static while each island chooses its own hydration trigger."
                  : "This section never hydrates. Only the component marked with "}
              {mixed || lateEmpty || lateIsland || strategies ? null : (
                <code>use hydrate</code>
              )}
              {mixed || lateEmpty || lateIsland || strategies
                ? null
                : " receives client interactivity."}
            </p>
          </section>
          {strategies ? (
            <section className="strategy-panel">
              <div>
                <p className="eyebrow">Strategy matrix</p>
                <h2>All hydration strategies</h2>
                <p>
                  This fixture keeps one island for each strategy on the same
                  page so tests can exercise scheduling and hydration behavior
                  together.
                </p>
              </div>
              <div className="strategy-list">
                <LoadStrategyIsland />
                <IdleStrategyIsland />
                <InteractionStrategyIsland />
                <MediaStrategyIsland />
                <NeverStrategyIsland />
                <div className="strategy-viewport-target">
                  <VisibleStrategyIsland />
                </div>
              </div>
            </section>
          ) : mixed ? (
            <>
              <RootClient />
              <MixedCounterIsland />
              <section className="observer-panel client-loader-panel">
                <div>
                  <p className="eyebrow">Mixed viewport client module</p>
                  <p>
                    This island runs inside a hydrated page root, but its client
                    component still loads only after it becomes visible.
                  </p>
                  <MixedVisibleClientLoadIsland />
                </div>
              </section>
            </>
          ) : lateEmpty || lateIsland ? (
            <>
              <RootClient />
              <section className="rsc-panel">
                <div>
                  <p className="eyebrow">RSC navigation</p>
                  <h2>Island introduced by navigation</h2>
                  <p>
                    Start without the component, then fetch a new RSC payload.
                    In an RSC update, the use hydrate boundary renders as
                    regular React content instead of a new island.
                  </p>
                </div>
                <nav className="rsc-actions" aria-label="Root navigation">
                  <Link to="/?mode=late-empty" data-testid="hide-late-island">
                    Hide island
                  </Link>
                  <Link to="/?mode=late-island" data-testid="show-late-island">
                    Show island
                  </Link>
                </nav>
              </section>
              {lateIsland ? <LateCounterIsland /> : null}
            </>
          ) : (
            <>
              <CounterIsland />
              <RscNavigationIsland />
              <section className="observer-panel">
                <div>
                  <p className="eyebrow">Viewport strategy</p>
                  <p>
                    This island hydrates when its marker intersects the
                    viewport.
                  </p>
                  <VisibleCounterIsland />
                </div>
              </section>
              <section className="observer-panel client-loader-panel">
                <div>
                  <p className="eyebrow">Viewport client module</p>
                  <p>
                    This island keeps its client component module out of the
                    browser until the visibility strategy starts hydration.
                  </p>
                  <VisibleClientLoadIsland />
                </div>
              </section>
            </>
          )}
        </main>
      </body>
    </html>
  );
}
