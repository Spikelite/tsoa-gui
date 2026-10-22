import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";
import { fakeStore } from "./test/fakeStore";
import { system } from "./test/system";

describe("App", () => {
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

  it("switches skins from the menu", async () => {
    const { store, emit } = fakeStore();
    render(<App store={store} />);
    emit("model", system);
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Skin" }), { target: { value: "sci-fi-fof" } });
    expect(await screen.findByRole("meter", { name: "State of charge" })).toBeInTheDocument();
  });
});
