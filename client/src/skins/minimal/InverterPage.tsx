import { useControls } from "../../controls/controls";
import type { InverterCharger, System } from "../../model/system";
import { controlsGroup, inverterGroups } from "../details";
import { inverterState } from "../describe";
import { PartPage } from "./PartPage";

const LED_WORDS = { on: "On", off: "Off", blinking: "Blinking" };

// The inverter/charger's own page, with its front panel's lights, and its
// controls first for an account that may use them.
export function InverterPage({ inverter, model }: { inverter: InverterCharger; model: System }) {
  const controls = controlsGroup(useControls()?.states ?? [], model);
  return (
    <PartPage part="inverter_charger" title="Inverter" status={inverter.status} state={inverterState(inverter)}
      groups={[...(controls ? [controls] : []), ...inverterGroups(inverter, model)]} checks={inverter.checks}>
      {inverter.leds.length > 0 && (
        <ul className="leds" aria-label="Front panel lights">
          {inverter.leds.map((led) => (
            <li key={led.name} className={`led led-${led.state}`}>
              <span className="led-light" aria-hidden="true" />
              {led.name}
              <span className="check-level">{LED_WORDS[led.state]}</span>
            </li>
          ))}
        </ul>
      )}
    </PartPage>
  );
}
