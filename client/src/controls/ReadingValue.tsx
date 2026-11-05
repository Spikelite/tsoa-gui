import { useContext, useState } from "react";

import { Eased } from "../skins/Eased";
import type { Measured } from "../skins/readings";
import { OpenControlContext, useControl } from "./controls";
import { LimitPanel } from "./LimitPanel";
import "./controls.css";

// A measured reading's value, which for an account that may change it, on a
// device that has it, is a button opening the skin's screen for it, or else
// its panel. Everyone else sees the reading as it is.
export function ReadingValue({ reading }: { reading: Measured }) {
  const control = useControl(reading.control);
  const openScreen = useContext(OpenControlContext);
  const [open, setOpen] = useState(false);
  const value = <Eased value={reading.value} format={reading.format} />;
  if (control === null) {
    return value;
  }
  return (
    <>
      <button type="button" className="control-value" aria-expanded={openScreen ? undefined : open}
        title={`Change the ${reading.label}`} onClick={() => (openScreen ? openScreen(reading) : setOpen(!open))}>
        {value}
      </button>
      {open && (
        <LimitPanel label={reading.label} state={control.state} controls={control.controls}
          onClose={() => setOpen(false)} />
      )}
    </>
  );
}
