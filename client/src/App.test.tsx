import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { App } from "./App";
import { fakeStore } from "./test/fakeStore";
import { system } from "./test/system";

describe("App", () => {
  // The browser remembers the last skin chosen, so each test starts from none.
  beforeEach(() => {
    localStorage.clear();
  });

  it("names the application and waits for the first readings", () => {
    render(<App store={fakeStore().store} />);
    expect(screen.getByRole("heading", { level: 1, name: "tsoa-gui" })).toBeInTheDocument();
    expect(screen.getByText("Waiting for the first readings.")).toBeInTheDocument();
  });

  it("draws the system once readings arrive", () => {
    const { store, emit } = fakeStore();
    render(<App store={store} />);
    emit("model", system);
    expect(screen.getByRole("heading", { name: "Battery" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("says when the readings are no longer current", () => {
    const { store, emit } = fakeStore();
    render(<App store={store} />);
    emit("model", { ...system, live: false });
    expect(screen.getByRole("status")).toHaveTextContent("stopped hearing from the device");
    emit("error");
    expect(screen.getByRole("status")).toHaveTextContent("Lost the connection to the server");
  });

  it("says in a framed skin's own frame, not a notice, when the readings are no longer current", async () => {
    const { store, emit } = fakeStore();
    render(<App store={store} />);
    emit("model", system);
    fireEvent.change(screen.getByRole("combobox", { name: "Skin" }), { target: { value: "sci-fi-fof" } });
    const state = await screen.findByRole("status");
    expect(state).toHaveTextContent("Live");
    emit("model", { ...system, live: false });
    expect(screen.getByRole("status")).toHaveTextContent("Stale");
    expect(screen.getByRole("status")).toHaveTextContent("stopped hearing from the device");
    emit("error");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("Offline");
    expect(screen.getByRole("status")).toHaveTextContent("Lost the connection to the server");
    expect(screen.getByRole("status").closest(".fof-top")).not.toBeNull();
  });

  it("switches skins from the menu", async () => {
    const { store, emit } = fakeStore();
    render(<App store={store} />);
    emit("model", system);
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Skin" }), { target: { value: "sci-fi-fof" } });
    expect(await screen.findByRole("meter", { name: "State of charge" })).toBeInTheDocument();
  });

  it("moves the name, the clock and the skin choice into a framed skin's own frame, and switches back from there", async () => {
    const { store, emit } = fakeStore();
    render(<App store={store} />);
    emit("model", system);
    fireEvent.change(screen.getByRole("combobox", { name: "Skin" }), { target: { value: "sci-fi-fof" } });
    const choice = await screen.findByRole("button", { name: "Skin: Sci-Fi FOF" });
    // Like the bar's other segments, it shows only its value.
    expect(choice).toHaveTextContent(/^Sci-Fi FOF$/);
    expect(screen.queryByRole("combobox", { name: "Skin" })).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Time of day")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 1, name: "tsoa-gui" })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).closest(".fof-bottom")).not.toBeNull();

    // From the keyboard: open, move to the other skin, pick it.
    expect(choice).toHaveAttribute("aria-expanded", "false");
    fireEvent.keyDown(choice, { key: "ArrowDown" });
    expect(choice).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("listbox", { name: "Skin" });
    expect(screen.getByRole("option", { name: "Sci-Fi FOF" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(list, { key: "ArrowUp" });
    fireEvent.keyDown(list, { key: "Enter" });
    expect(await screen.findByRole("combobox", { name: "Skin" })).toHaveValue("minimal");
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
  });

  it("folds the frame's skin list away on Escape without changing skin", async () => {
    const { store, emit } = fakeStore();
    render(<App store={store} />);
    emit("model", system);
    fireEvent.change(screen.getByRole("combobox", { name: "Skin" }), { target: { value: "sci-fi-fof" } });
    const choice = await screen.findByRole("button", { name: "Skin: Sci-Fi FOF" });
    fireEvent.click(choice);
    fireEvent.keyDown(screen.getByRole("listbox", { name: "Skin" }), { key: "Escape" });
    expect(choice).toHaveAttribute("aria-expanded", "false");
    expect(choice).toHaveFocus();
    expect(screen.getByRole("meter", { name: "State of charge" })).toBeInTheDocument();
  });
});
