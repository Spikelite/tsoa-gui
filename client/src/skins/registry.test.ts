import { describe, expect, it } from "vitest";

import { addressWithSkin, chosenSkin, DEFAULT_SKIN, rememberSkin } from "./registry";

function storageWith(saved: string | null) {
  const values = new Map<string, string>(saved === null ? [] : [["tsoa-gui.skin", saved]]);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

describe("chosenSkin", () => {
  it("takes the skin in the address first, for kiosk screens", () => {
    expect(chosenSkin("?skin=sci-fi-fof", storageWith("minimal"))).toBe("sci-fi-fof");
  });

  it("falls back to the browser's last choice, then the default", () => {
    expect(chosenSkin("", storageWith("sci-fi-fof"))).toBe("sci-fi-fof");
    expect(chosenSkin("", storageWith(null))).toBe(DEFAULT_SKIN);
  });

  it("ignores a skin it does not know", () => {
    expect(chosenSkin("?skin=nonexistent", storageWith("also-unknown"))).toBe(DEFAULT_SKIN);
  });

  it("works when the browser refuses storage", () => {
    const refusing = {
      getItem: () => {
        throw new Error("storage is off");
      },
    };
    expect(chosenSkin("", refusing)).toBe(DEFAULT_SKIN);
    expect(() =>
      rememberSkin("sci-fi-fof", {
        setItem: () => {
          throw new Error("storage is off");
        },
      }),
    ).not.toThrow();
  });

  it("remembers a choice for next time", () => {
    const storage = storageWith(null);
    rememberSkin("sci-fi-fof", storage);
    expect(chosenSkin("", storage)).toBe("sci-fi-fof");
  });
});

describe("addressWithSkin", () => {
  it("rewrites a skin already in the address, so a reload keeps the choice", () => {
    expect(addressWithSkin("https://example.com/?skin=minimal", "sci-fi-fof")).toBe(
      "https://example.com/?skin=sci-fi-fof",
    );
  });

  it("leaves an address without one alone", () => {
    expect(addressWithSkin("https://example.com/", "sci-fi-fof")).toBeNull();
  });
});
