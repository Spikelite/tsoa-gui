import { useSyncExternalStore } from "react";

import { SystemStore, type SystemState } from "./store";

// One stream per page, however many components read the model.
const pageStore = new SystemStore();

export function useSystem(store: SystemStore = pageStore): SystemState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
