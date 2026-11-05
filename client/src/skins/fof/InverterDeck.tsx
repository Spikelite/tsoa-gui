import { useControls } from "../../controls/controls";
import type { InverterCharger, System } from "../../model/system";
import { controlsGroup, inverterGroups } from "../details";
import { inverterState } from "../describe";
import { Eased } from "../Eased";
import * as f from "../format";
import { Deck } from "./Deck";
import { InverterCore } from "./InverterCore";
import { FRONT_PANEL } from "./sections";

const LED_WORDS = { on: "on", off: "off", blinking: "blinking" };

// The inverter/charger's own page, drawn large as its hub with its front
// panel's lights, each a block lit, blinking or dark as on the unit, in a
// column of their own on a landscape screen, and its controls first among its
// sections for an account that may use them.
export function InverterDeck({ inverter, model }: { inverter: InverterCharger; model: System }) {
  const controls = controlsGroup(useControls()?.states ?? [], model);
  return (
    <Deck part="inverter_charger" title="Inverter" status={inverter.status} state={inverterState(inverter)}
      className="fof-deck-sided" controls={controls?.readings} groups={inverterGroups(inverter, model)}
      checks={inverter.checks} drawnWith={FRONT_PANEL}
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
