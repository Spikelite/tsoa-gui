import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeServer } from "../test/fakeServer";
import { AccountPage } from "./AccountPage";

const type = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } });

const admin = { account: { name: "owner", role: "admin" }, setup_needed: false, csrf: "token" };
const operator = { account: { name: "crew", role: "operator" }, setup_needed: false, csrf: "token" };
const everyone = [{ name: "crew", role: "operator" }, { name: "owner", role: "admin" }];

describe("the account page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends someone signed out to sign in, and back here after", async () => {
    fakeServer({ "GET /api/session": { body: { account: null, setup_needed: false, csrf: null } } });
    render(<AccountPage />);
    expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?next=/account");
  });

  it("lets an operator change their password and sign out, but not see the accounts", async () => {
    const sent = fakeServer({ "GET /api/session": { body: operator }, "POST /api/session/password": { status: 204 },
      "DELETE /api/session": { status: 204 } });
    const go = vi.fn();
    render(<AccountPage go={go} />);

    type(await screen.findByLabelText("Current password"), "correct horse");
    type(screen.getByLabelText("New password"), "battery staple");
    type(screen.getByLabelText("New password again"), "battery staple");
    fireEvent.click(screen.getByRole("button", { name: "Change it" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Your password is changed.");
    expect(sent.at(-1)).toMatchObject({ path: "/api/session/password", csrf: "token",
      body: { current: "correct horse", password: "battery staple" } });
    expect(screen.queryByRole("heading", { name: "Accounts" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("/"));
    expect(sent.at(-1)).toMatchObject({ method: "DELETE", path: "/api/session", csrf: "token" });
  });

  it("lets an admin see and add accounts, but not change their own role", async () => {
    let accounts = everyone;
    const sent = fakeServer({
      "GET /api/session": { body: admin },
      "GET /api/accounts": () => ({ body: accounts }),
      "POST /api/accounts": ({ body }) => {
        accounts = [...accounts, { name: (body as { name: string }).name, role: "viewer" }];
        return { status: 201, body: accounts.at(-1) };
      },
    });
    render(<AccountPage />);

    const list = await screen.findByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByLabelText("Role of owner")).toBeDisabled();
    expect(screen.getByLabelText("Role of crew")).toBeEnabled();

    const adding = screen.getByRole("heading", { name: "Add an account" }).closest("form")!;
    type(within(adding).getByLabelText("Name"), "guest");
    type(within(adding).getByLabelText(/^Password/), "correct horse");
    fireEvent.click(within(adding).getByRole("button", { name: "Add it" }));
    expect(await screen.findByText("guest")).toBeInTheDocument();
    expect(sent.find((request) => request.method === "POST")).toMatchObject({ path: "/api/accounts", csrf: "token",
      body: { name: "guest", password: "correct horse", role: "viewer" } });
  });

  it("keeps what was typed when an account cannot be added", async () => {
    fakeServer({
      "GET /api/session": { body: admin },
      "GET /api/accounts": { body: everyone },
      "POST /api/accounts": { status: 409, body: { detail: "There is already an account called crew." } },
    });
    render(<AccountPage />);

    const adding = (await screen.findByRole("heading", { name: "Add an account" })).closest("form")!;
    type(within(adding).getByLabelText("Name"), "crew");
    type(within(adding).getByLabelText(/^Password/), "correct horse");
    fireEvent.click(within(adding).getByRole("button", { name: "Add it" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already an account called crew");
    expect(within(adding).getByLabelText("Name")).toHaveValue("crew");
  });
});
