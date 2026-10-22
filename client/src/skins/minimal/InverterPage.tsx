import type { InverterCharger, System } from "../../model/system";
import { inverterGroups } from "../details";
import { inverterState } from "../describe";
import { PartPage } from "./PartPage";

const LED_WORDS = { on: "On", off: "Off", blinking: "Blinking" };

// The inverter/charger's own page, with its front panel's lights.
export function InverterPage({ inverter, model }: { inverter: InverterCharger; model: System }) {
  return (
    <PartPage part="inverter_charger" title="Inverter" status={inverter.status} state={inverterState(inverter)}
      groups={inverterGroups(inverter, model)} checks={inverter.checks}>
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
