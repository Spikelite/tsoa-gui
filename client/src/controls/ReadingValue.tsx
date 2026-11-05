import { useState } from "react";

import { Eased } from "../skins/Eased";
import type { Measured } from "../skins/readings";
import { useControl } from "./controls";
import { LimitPanel } from "./LimitPanel";
import "./controls.css";

// A measured reading's value, which for an account that may change it, on a
// device that has it, is a button opening its panel. Everyone else sees the
// reading as it is.
export function ReadingValue({ reading }: { reading: Measured }) {
  const control = useControl(reading.control);
  const [open, setOpen] = useState(false);
  const value = <Eased value={reading.value} format={reading.format} />;
  if (control === null) {
    return value;
  }
  return (
    <>
      <button type="button" className="control-value" aria-expanded={open} title={`Change the ${reading.label}`}
        onClick={() => setOpen(!open)}>
        {value}
      </button>
      {open && (
        <LimitPanel label={reading.label} state={control.state} controls={control.controls}
          onClose={() => setOpen(false)} />
      )}
    </>
  );
}
