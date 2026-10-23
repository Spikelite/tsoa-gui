import type { PartName, System } from "../../model/system";
import { partDetail } from "../details";
import { Eased } from "../Eased";
import { Deck } from "./Deck";
import { GeneratorCore } from "./GeneratorCore";
import { GridTower } from "./GridTower";
import { LoadPanel } from "./LoadPanel";
import { SolarArray } from "./SolarArray";

/** The part drawn large, as the overview draws it. */
function Art({ part, model }: { part: PartName; model: System }) {
  switch (part) {
    case "grid":
      return model.grid && <GridTower grid={model.grid} />;
    case "generator":
      return model.generator && <GeneratorCore generator={model.generator} />;
    case "solar":
      return model.solar && <SolarArray solar={model.solar} />;
    case "ac_loads":
      return model.ac_loads && (
        <LoadPanel power={model.ac_loads.power_w} status={model.ac_loads.status} feed="inverter_charger-ac_loads" />
      );
    case "dc_loads":
      return model.dc_loads && (
        <LoadPanel power={model.dc_loads.power_w} status={model.dc_loads.status} feed="dc_bus-dc_loads" />
      );
    default:
      return null;
  }
}

// The page of a part with nothing of its own to draw beyond its overview
// drawing: that drawing large, with its power at the far end of its name's
// row, then its readings.
export function PartDeck({ part, model }: { part: PartName; model: System }) {
  const detail = partDetail(part, model);
  if (detail === null) {
    return null;
  }
  return (
    <Deck part={part} title={detail.title} status={detail.status} state={detail.state} groups={detail.groups}
      checks={[]}
      aside={
        <p className="fof-deck-figure fof-deck-head-figure">
          <Eased value={detail.headline.value} format={detail.headline.format} />
        </p>
      }>
      <div className="fof-deck-art">
        <Art part={part} model={model} />
      </div>
    </Deck>
  );
}
