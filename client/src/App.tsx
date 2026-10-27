import { Suspense, useState } from "react";

import { Clock } from "./Clock";
import type { SystemState, SystemStore } from "./model/store";
import type { System } from "./model/system";
import { useSystem } from "./model/useSystem";
import { SkinBoundary, type Reloading } from "./SkinBoundary";
import { link, LINK_SENTENCES } from "./skins/link";
import { addressWithSkin, chosenSkin, rememberSkin, SKINS } from "./skins/registry";
import { SkinChoiceContext } from "./skins/skinChoice";

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function App({ store, reloading }: { store?: SystemStore; reloading?: Reloading }) {
  const state = useSystem(store);
  const { model, connected, busy } = state;
  const [skinId, setSkinId] = useState(() => chosenSkin(window.location.search, browserStorage()));
  const skin = SKINS.find((candidate) => candidate.id === skinId) ?? SKINS[0]!;

  const choose = (id: string) => {
    setSkinId(id);
    rememberSkin(id, browserStorage());
    const address = addressWithSkin(window.location.href, id);
    if (address !== null) {
      window.history.replaceState(null, "", address);
    }
  };

  const Skin = skin.component;
  const choice = { skins: SKINS.map(({ id, name }) => ({ id, name })), current: skin.id, choose };
  return (
    <div className={`app skin-${skin.id}`}>
      <header className="app-header">
        {/* A framed skin shows the name, the clock and the skin choice in its own frame, once it is drawn. */}
        {(!skin.framed || model === null) && <h1>tsoa-gui</h1>}
        {/* A framed skin says how current the readings are in its own frame. */}
        {!skin.framed && <Notice model={model} connected={connected} busy={busy} />}
        {!skin.framed && (
          <>
            <Clock />
            <label className="skin-menu">
              Skin
              <select value={skin.id} onChange={(event) => choose(event.target.value)}>
                {SKINS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </header>
      <main>
        {model === null ? (
          <Waiting state={state} />
        ) : (
          <SkinBoundary reloading={reloading}>
            <SkinChoiceContext.Provider value={choice}>
              <Suspense fallback={<p className="waiting">Loading the skin.</p>}>
                <Skin model={model} connected={connected} busy={busy} />
              </Suspense>
            </SkinChoiceContext.Provider>
          </SkinBoundary>
        )}
      </main>
    </div>
  );
}

function Notice({ model, connected, busy }: { model: System | null; connected: boolean; busy: boolean }) {
  if (model === null) {
    return null;
  }
  const state = link(model, connected, busy);
  return state === "live" ? null : <p className="notice" role="status">{LINK_SENTENCES[state]}</p>;
}

const TROUBLESHOOTING = "https://github.com/Spikelite/tsoa-gui/blob/main/docs/install.md#troubleshooting";

const WAITING_SENTENCES = {
  stream: "This page cannot reach the tsoa-gui server.",
  connecting: "The tsoa-gui server is still trying to reach the device's MQTT broker.",
  broker_unreachable: "The tsoa-gui server cannot reach the device's MQTT broker.",
  broker_silent: "The tsoa-gui server reaches the device's MQTT broker, but hears no readings from it.",
} as const;

function Waiting({ state }: { state: SystemState }) {
  // Turned away, the page knows why at once, and nothing in the install guide would help.
  if (state.busy) {
    return (
      <p className="waiting" role="status">
        No readings yet. The tsoa-gui server has as many screens open as it allows. This page tries again by itself.
      </p>
    );
  }
  if (!state.overdue) {
    return <p className="waiting">Waiting for the first readings.</p>;
  }
  const cause = state.connected ? (state.waiting ?? "connecting") : "stream";
  return (
    <div className="waiting" role="status">
      <p>No readings yet. {WAITING_SENTENCES[cause]}</p>
      <p>
        <a href={TROUBLESHOOTING}>Troubleshooting</a> in the install guide says what to check.
      </p>
    </div>
  );
}
