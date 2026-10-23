import { createContext, useContext } from "react";

/** The skins a viewer can choose from, the one showing, and how to choose. */
export interface SkinChoice {
  skins: { id: string; name: string }[];
  current: string;
  choose: (id: string) => void;
}

/**
 * The skin choice, for a skin that draws it in its own frame. Outside the app,
 * as in a skin's own tests, there is none.
 */
export const SkinChoiceContext = createContext<SkinChoice | null>(null);

export function useSkinChoice(): SkinChoice | null {
  return useContext(SkinChoiceContext);
}
