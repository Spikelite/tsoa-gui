import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { Root } from "./Root";
import { fakeServer } from "./test/fakeServer";
import { fakeStore } from "./test/fakeStore";
import { system } from "./test/system";

const signedOut = { account: null, setup_needed: false, csrf: null };
const crew = { account: { name: "crew", role: "operator" }, setup_needed: false, csrf: "token" };

async function shown(skin: string) {
  localStorage.setItem("tsoa-gui.skin", skin);
  const { store, emit } = fakeStore();
  render(<App store={store} />);
  await act(async () => {
    emit("model", system);
  });
}

describe("who is signed in", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(["minimal", "sci-fi-fof"])("shows nothing about signing in to someone signed out, in %s", async (skin) => {
    fakeServer({ "GET /api/session": { body: signedOut } });
    await shown(skin);
    expect(screen.queryByRole("link", { name: /sign in|crew/i })).toBeNull();
  });

  it.each(["minimal", "sci-fi-fof"])("names the signed-in account, linking to it, in %s", async (skin) => {
    fakeServer({ "GET /api/session": { body: crew } });
    await shown(skin);
    const link = await screen.findByRole("link", { name: "crew" });
    expect(link).toHaveAttribute("href", "/account");
    expect(link).toHaveAccessibleDescription("Your account");
  });
});

describe("the page at each address", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([["/login", "Sign in"], ["/account", "Account"]])("draws %s", async (path, title) => {
    vi.stubGlobal("fetch", () => new Promise(() => {}));
    render(<Root path={path} />);
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
  });
});
