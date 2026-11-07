import { useState } from "react";

import { useControls } from "../../controls/controls";
import type { AlarmCheck, PartName, System } from "../../model/system";
import { batteryGroups, controlsGroup, inverterGroups, partDetail } from "../details";
import { useSmallPanel } from "./smallPanel";

/** A section's color says what it holds, whatever else is on the page. Any other is the part's own, in sand. */
const TONES: Partial<Record<string, string>> = { History: "lavender", Extremes: "lavender", Energy: "lavender", Device: "teal", Checks: "teal" };

export const sectionTone = (title: string) => TONES[title] ?? "sand";

/** The sections that are not one of a part's groups of readings. */
export const CONTROLS = "Controls";
export const FRONT_PANEL = "Front panel";
export const CHECKS = "Checks";

/** The bar over the checks that are clear, which says all of them are if nothing is raised. */
export function clearWords(count: number, anyRaised: boolean): string {
  if (anyRaised) {
    return `${count} more clear`;
  }
  return count === 1 ? "1 check clear" : `All ${count} checks clear`;
}

/** What the sidebar calls a part's checks. */
function checksLabel(checks: AlarmCheck[]): string {
  const raised = checks.filter((check) => check.level !== "ok").length;
  return raised > 0 ? `${raised} raised` : clearWords(checks.length, false);
}

/** The worst a part's checks have raised, as the status it shows in. */
function worstRaised(checks: AlarmCheck[]): "fault" | "warning" | undefined {
  if (checks.some((check) => check.level === "alarm")) {
    return "fault";
  }
  return checks.some((check) => check.level === "warning") ? "warning" : undefined;
}

export type Section = { title: string; label: string; tone: string; raised?: "fault" | "warning" };

const section = (title: string): Section => ({ title, label: title, tone: sectionTone(title) });

const checksSection = (checks: AlarmCheck[]): Section[] => (checks.length === 0 ? [] : [{
  ...section(CHECKS), label: checksLabel(checks), raised: worstRaised(checks),
}]);

/** The sections of a part's page, in order. */
function pageSections(part: PartName, model: System, controls: { name: string; value: number }[]): Section[] {
  const { battery, inverter_charger: inverter } = model;
  if (model[part]?.status === "offline") {
    return [];
  }
  if (part === "battery" && battery !== null) {
    return [...batteryGroups(battery).map(({ title }) => section(title)), ...checksSection(battery.checks)];
  }
  if (part === "inverter_charger" && inverter !== null) {
    return [
      ...(inverter.leds.length > 0 ? [section(FRONT_PANEL)] : []),
      ...(controlsGroup(controls, model) ? [section(CONTROLS)] : []),
      ...inverterGroups(inverter, model).map(({ title }) => section(title)),
      ...checksSection(inverter.checks),
    ];
  }
  return (partDetail(part, model)?.groups ?? []).map(({ title }) => section(title));
}

export type PageSections = { all: Section[]; shown: string; choose: (title: string) => void };

/** On a small panel, the page's sections and the one showing, chosen from the sidebar; anywhere else, null. */
export function usePageSections(part: PartName | null, model: System): PageSections | null {
  const small = useSmallPanel();
  const controls = useControls()?.states ?? [];
  const [chosen, setChosen] = useState<string | null>(null);
  if (!small || part === null) {
    return null;
  }
  const all = pageSections(part, model, controls);
  const shown = all.find(({ title }) => title === chosen) ?? all[0];
  return shown === undefined ? null : { all, shown: shown.title, choose: setChosen };
}
