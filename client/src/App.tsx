import { Suspense, useState } from "react";

import { Clock } from "./Clock";
import type { SystemStore } from "./model/store";
import type { System } from "./model/system";
import { useSystem } from "./model/useSystem";
import { addressWithSkin, chosenSkin, rememberSkin, SKINS } from "./skins/registry";
import { SkinChoiceContext } from "./skins/skinChoice";

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function App({ store }: { store?: SystemStore }) {
  const { model, connected } = useSystem(store);
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
        <h1>tsoa-gui</h1>
        <Notice model={model} connected={connected} />
        {/* A framed skin shows these in its own frame. */}
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
          <p className="waiting">Waiting for the first readings.</p>
        ) : (
          <SkinChoiceContext.Provider value={choice}>
            <Suspense fallback={<p className="waiting">Loading the skin.</p>}>
              <Skin model={model} />
            </Suspense>
          </SkinChoiceContext.Provider>
        )}
      </main>
    </div>
  );
}

// Old readings are never passed off as current.
function Notice({ model, connected }: { model: System | null; connected: boolean }) {
  if (model === null) {
    return null;
  }
  if (!connected) {
    return <p className="notice" role="status">Lost the connection to the server. These are the last readings it sent.</p>;
  }
  if (!model.live) {
    return <p className="notice" role="status">The server has stopped hearing from the device. These are the last readings it had.</p>;
  }
  return null;
}
