import type { InverterCharger, System } from "../../model/system";
import { inverterGroups } from "../details";
import { inverterState } from "../describe";
import { Eased } from "../Eased";
import * as f from "../format";
import { Deck } from "./Deck";
import { InverterCore } from "./InverterCore";

const LED_WORDS = { on: "on", off: "off", blinking: "blinking" };

// The inverter/charger's own page, drawn large as its hub beside its front
// panel's lights, each a button lit, blinking or dark as on the unit, with
// the power it is putting out at the far end of its name's row.
export function InverterDeck({ inverter, model }: { inverter: InverterCharger; model: System }) {
  return (
    <Deck part="inverter_charger" title="Inverter" status={inverter.status} state={inverterState(inverter)}
      groups={inverterGroups(inverter, model)} checks={inverter.checks}
      aside={
        <p className="fof-deck-figure fof-deck-head-figure">
          <Eased value={inverter.ac_out_power_w} format={f.power} />
        </p>
      }>
      <div className="fof-deck-unit">
        <div className="fof-deck-hub">
          <InverterCore inverter={inverter} />
        </div>
        {inverter.leds.length > 0 && (
          <ul className="fof-deck-leds" aria-label="Front panel lights">
            {inverter.leds.map((led) => (
              <li key={led.name} className={`fof-deck-led fof-deck-led-${led.state}`}>
                {led.name}
                <span className="fof-quiet">, {LED_WORDS[led.state]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Deck>
  );
}
