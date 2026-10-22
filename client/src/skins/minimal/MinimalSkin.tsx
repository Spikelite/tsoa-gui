import type { System } from "../../model/system";
import { detailedPart } from "../details";
import { useEscapeCloses, usePart } from "../partView";
import { BatteryPage } from "./BatteryPage";
import { InverterPage } from "./InverterPage";
import { Flows } from "./Flows";
import "./minimal.css";
import {
  AcLoadsPanel, BatteryPanel, DcLoadsPanel, GeneratorPanel, GridPanel, InverterChargerPanel, SolarPanel,
} from "./Panels";

// The default skin: minimal and technical. One panel per part the system
// has, with power moving between them as animated flow, and a page of its
// own for a part that has one.
export function MinimalSkin({ model }: { model: System }) {
  const part = detailedPart(usePart(), model);
  useEscapeCloses(part !== null);
  if (part !== null) {
    return (
      <div className="minimal minimal-page">
        {part === "battery" && model.battery && <BatteryPage battery={model.battery} />}
        {part === "inverter_charger" && model.inverter_charger && (
          <InverterPage inverter={model.inverter_charger} model={model} />
        )}
      </div>
    );
  }
  return (
    <div className="minimal">
      <Flows flows={model.flows} />
      {model.grid && <GridPanel grid={model.grid} model={model} />}
      {model.generator && <GeneratorPanel generator={model.generator} />}
      {model.inverter_charger && <InverterChargerPanel inverter={model.inverter_charger} model={model} />}
      {model.battery && <BatteryPanel battery={model.battery} />}
      {model.solar && <SolarPanel solar={model.solar} />}
      {model.ac_loads && <AcLoadsPanel loads={model.ac_loads} />}
      {model.dc_loads && <DcLoadsPanel loads={model.dc_loads} />}
    </div>
  );
}
