import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeServer } from "../test/fakeServer";
import { LoginPage } from "./LoginPage";
import { nextAddress } from "./session";

const signedOut = { account: null, setup_needed: false, csrf: null };
const type = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } });

const owner = { account: { name: "owner", role: "admin" }, setup_needed: false, csrf: "token" };

describe("the sign-in page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("signs in and goes back to the page that sent someone there", async () => {
    window.history.replaceState(null, "", "/login?next=/%3Fpart%3Dbattery");
    const sent = fakeServer({ "GET /api/session": { body: signedOut }, "POST /api/session": { body: owner } });
    const go = vi.fn();
    render(<LoginPage go={go} />);

    type(await screen.findByLabelText("Name"), "owner");
    type(screen.getByLabelText("Password"), "correct horse");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(go).toHaveBeenCalledWith("/?part=battery"));
    expect(sent.at(-1)).toMatchObject({ method: "POST", path: "/api/session",
      body: { name: "owner", password: "correct horse" } });
    window.history.replaceState(null, "", "/");
  });

  it("says why a sign-in was refused", async () => {
    fakeServer({ "GET /api/session": { body: signedOut },
      "POST /api/session": { status: 401, body: { detail: "Wrong name or password." } } });
    const go = vi.fn();
    render(<LoginPage go={go} />);

    type(await screen.findByLabelText("Name"), "owner");
    type(screen.getByLabelText("Password"), "wrong horse");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong name or password.");
    expect(go).not.toHaveBeenCalled();
  });

  it("makes the first account on a new server, with the setup code", async () => {
    const sent = fakeServer({ "GET /api/session": { body: { ...signedOut, setup_needed: true } },
      "POST /api/setup": { body: owner } });
    const go = vi.fn();
    render(<LoginPage go={go} />);

    expect(await screen.findByRole("heading", { name: "Make the first account" })).toBeInTheDocument();
    type(screen.getByLabelText("Setup code"), "ABCD-EFGH-JKLM");
    type(screen.getByLabelText("Name"), "owner");
    type(screen.getByLabelText("Password"), "correct horse");
    type(screen.getByLabelText("Password again"), "correct horsf");
    fireEvent.click(screen.getByRole("button", { name: "Make the account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("not the same");

    type(screen.getByLabelText("Password again"), "correct horse");
    fireEvent.click(screen.getByRole("button", { name: "Make the account" }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("/account"));
    expect(sent.at(-1)).toMatchObject({ path: "/api/setup",
      body: { code: "ABCD-EFGH-JKLM", name: "owner", password: "correct horse" } });
  });

  it("says when someone is already signed in", async () => {
    fakeServer({ "GET /api/session": { body: owner } });
    render(<LoginPage />);
    expect(await screen.findByText(/You are signed in as owner/)).toBeInTheDocument();
  });

  it("says when the server cannot be reached", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("offline")));
    render(<LoginPage />);
    expect(await screen.findByText(/cannot be reached/)).toBeInTheDocument();
  });
});

describe("where sign-in goes next", () => {
  it("goes only to a page of this server's", () => {
    expect(nextAddress("?next=/account")).toBe("/account");
    expect(nextAddress("?next=/%3Fskin%3Dfof")).toBe("/?skin=fof");
    for (const away of ["https://example.com/", "//example.com/", "/\\example.com/", "account", ""]) {
      expect(nextAddress(`?next=${encodeURIComponent(away)}`)).toBe("/");
    }
    expect(nextAddress("")).toBe("/");
  });
});
