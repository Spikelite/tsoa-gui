import { useState, type CSSProperties, type ReactNode } from "react";

import type { AcLoads, PartName, System } from "../../model/system";
import { partDetail, powerShares } from "../details";
import { Eased } from "../Eased";
import * as f from "../format";
import { ConduitRun } from "./ConduitRun";
import { Deck, SectionHead } from "./Deck";
import { GeneratorCore } from "./GeneratorCore";
import { GridTower } from "./GridTower";
import { BUS_RUN, LoadPanel } from "./LoadPanel";
import { SolarArray } from "./SolarArray";
import { steadyPeriod } from "./wavePeriod";
import { crestPhase, LAUNCH_PHASE, WAVE } from "./waves";

/** How long the conduit leaving a supply's row of pips is, in em. */
const SUPPLY_RUN = 5.5;

/** The part drawn large, as the overview draws it, with a length of its conduit. */
function Art({ part, model, run }: { part: PartName; model: System; run: ReactNode }) {
  switch (part) {
    case "grid":
      return model.grid && <GridTower grid={model.grid} run={run} />;
    case "generator":
      return model.generator && <GeneratorCore generator={model.generator} run={run} />;
    case "solar":
      return model.solar && <SolarArray solar={model.solar} run={run} />;
    case "ac_loads":
      return model.ac_loads && (
        <LoadPanel power={model.ac_loads.power_w} status={model.ac_loads.status} feed="inverter_charger-ac_loads" run={run} />
      );
    case "dc_loads":
      return model.dc_loads && (
        <LoadPanel power={model.dc_loads.power_w} status={model.dc_loads.status} feed="dc_bus-dc_loads" run={run} />
      );
    default:
      return null;
  }
}

/** Where a panel's power goes, as a bar shared out among its circuits. */
function PowerShares({ loads }: { loads: AcLoads }) {
  const shares = powerShares(loads);
  return (
    <section className="fof-deck-group fof-deck-shares" aria-label="Where the power goes">
      <SectionHead tone="teal" title={<span>Where <Eased value={loads.power_w} format={f.power} /> goes</span>} />
      <ul className="fof-deck-share">
        {shares.map(({ label, power_w: power, metered }) => (
          <li key={label} className={metered ? undefined : "fof-deck-share-rest"} style={{ flexGrow: power }}>
            <span className="fof-deck-share-name">{label}</span> <Eased value={power} format={f.power} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** How long each wave takes at this power, kept from before until the power has moved enough to change it. */
function useWavePeriod(power: number): number {
  const [period, setPeriod] = useState(() => steadyPeriod(undefined, power));
  const next = steadyPeriod(period, power);
  if (next !== period) {
    setPeriod(next);
  }
  return next;
}

// The page of a part with nothing of its own to draw beyond its overview
// drawing: that drawing large, with a length of the conduit that meets it on
// the overview, and its power at the far end of its name's row, then its
// readings. A panel with circuits says beside it where its power goes.
export function PartDeck({ part, model }: { part: PartName; model: System }) {
  const detail = partDetail(part, model);
  const flows = model.flows.filter(({ source, target }) => source === part || target === part);
  // A part can have several, as the supply-side loads do beside those on the inverter/charger's output.
  const outward = flows.reduce((sum, flow) => sum + (flow.source === part ? flow.power_w : -flow.power_w), 0);
  const power = Math.abs(outward);
  const period = useWavePeriod(power);
  if (detail === null) {
    return null;
  }
  const load = part === "ac_loads" || part === "dc_loads";
  const shared = part === "ac_loads" && model.ac_loads !== null && powerShares(model.ac_loads).length > 0;
  // What the drawing times itself to, which Conduits.tsx gives it on the overview.
  const pace = Object.fromEntries(flows.map((flow) => [`--fof-roll-${flow.source}-${flow.target}`, `${period}s`])) as CSSProperties;
  return (
    <Deck part={part} title={detail.title} status={detail.status} state={detail.state} groups={detail.groups}
      checks={[]}
      aside={
        <p className="fof-deck-figure fof-deck-head-figure">
          <Eased value={detail.headline.value} format={detail.headline.format} />
        </p>
      }>
      <div className={`fof-deck-art${shared ? " fof-deck-art-shared" : ""}`} style={pace}>
        <Art part={part} model={model} run={(
          <ConduitRun length={load ? BUS_RUN : SUPPLY_RUN} power={power} period={period}
            phase={load ? crestPhase(BUS_RUN, WAVE) : LAUNCH_PHASE} reversed={!load && outward < 0} />
        )} />
        {shared && <PowerShares loads={model.ac_loads!} />}
      </div>
    </Deck>
  );
}
