import type { System } from "../../model/system";
import { Flows } from "./Flows";
import "./minimal.css";
import {
  AcLoadsPanel, BatteryPanel, DcLoadsPanel, GeneratorPanel, GridPanel, InverterChargerPanel, SolarPanel,
} from "./Panels";

// The default skin: minimal and technical. One panel per part the system
// has, with power moving between them as animated flow.
export function MinimalSkin({ model }: { model: System }) {
  return (
    <div className="minimal">
      <Flows flows={model.flows} />
      {model.grid && <GridPanel grid={model.grid} />}
      {model.generator && <GeneratorPanel generator={model.generator} />}
      {model.inverter_charger && <InverterChargerPanel inverter={model.inverter_charger} />}
      {model.battery && <BatteryPanel battery={model.battery} />}
      {model.solar && <SolarPanel solar={model.solar} />}
      {model.ac_loads && <AcLoadsPanel loads={model.ac_loads} />}
      {model.dc_loads && <DcLoadsPanel loads={model.dc_loads} />}
    </div>
  );
}
