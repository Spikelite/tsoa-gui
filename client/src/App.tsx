import type { SystemStore } from "./model/store";
import type { System } from "./model/system";
import { useSystem } from "./model/useSystem";
import { MinimalSkin } from "./skins/minimal/MinimalSkin";

export function App({ store }: { store?: SystemStore }) {
  const { model, connected } = useSystem(store);
  return (
    <>
      <header className="app-header">
        <h1>tsoa-gui</h1>
        <Notice model={model} connected={connected} />
      </header>
      <main>
        {model === null ? <p className="waiting">Waiting for the first readings.</p> : <MinimalSkin model={model} />}
      </main>
    </>
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
