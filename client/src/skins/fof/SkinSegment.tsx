import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

import { useSkinChoice } from "../skinChoice";

// The skin choice as a segment of the frame's top bar. Chosen, the segment
// extends down as a bar to the skin showing, which joins it like an elbow,
// with the other skins beside it as free-standing rounded buttons, each
// sliding in after the one above; picking one shows it and folds the list
// away again. It works as a list box from the keyboard: the arrow keys move
// through the skins, Enter or Space picks one, and Escape or Tab folds the
// list without picking.
export function SkinSegment() {
  const choice = useSkinChoice();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const list = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const options = useRef<(HTMLLIElement | null)[]>([]);
  // How far the bar reaches: down to the bottom of the skin showing.
  const [reach, setReach] = useState(0);
  const currentIndex = choice ? choice.skins.findIndex((skin) => skin.id === choice.current) : -1;

  useLayoutEffect(() => {
    const showing = options.current[currentIndex];
    if (showing) {
      setReach(showing.offsetTop + showing.offsetHeight);
    }
  }, [currentIndex, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  useEffect(() => {
    if (open) {
      options.current[active]?.focus();
    }
  }, [open, active]);

  if (choice === null) {
    return null;
  }
  const current = choice.skins.find((skin) => skin.id === choice.current);

  const show = () => {
    setActive(Math.max(0, currentIndex));
    setOpen(true);
  };
  const fold = (refocus: boolean) => {
    setOpen(false);
    if (refocus) {
      button.current?.focus();
    }
  };
  const pick = (id: string) => {
    fold(true);
    if (id !== choice.current) {
      choice.choose(id);
    }
  };

  const onButtonKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      show();
    }
  };
  const onListKey = (event: KeyboardEvent) => {
    const last = choice.skins.length - 1;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(last, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActive(event.key === "Home" ? 0 : last);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pick(choice.skins[active]!.id);
    } else if (event.key === "Escape") {
      event.preventDefault();
      fold(true);
    } else if (event.key === "Tab") {
      fold(false);
    }
  };

  return (
    <div ref={root} className={`fof-select${open ? " fof-select-open" : ""}`}>
      <button ref={button} type="button" className="fof-segment fof-select-button" aria-haspopup="listbox"
        aria-expanded={open} aria-controls={list} aria-label={`Skin: ${current?.name ?? ""}`}
        onClick={() => (open ? fold(false) : show())} onKeyDown={onButtonKey}>
        <span className="fof-select-caption" aria-hidden="true">Skin</span>
        <span>{current?.name}</span>
      </button>
      <div className="fof-select-drop" aria-hidden={!open}>
        <span className="fof-select-bar" style={{ height: reach }} />
        <ul id={list} role="listbox" aria-label="Skin" className="fof-select-list" onKeyDown={onListKey}>
          {choice.skins.map((skin, index) => (
            <li key={skin.id} ref={(element) => { options.current[index] = element; }} role="option"
              aria-selected={skin.id === choice.current} tabIndex={-1}
              className={`fof-segment fof-select-option${skin.id === choice.current ? " fof-select-current" : ""}`}
              style={{ transitionDelay: open ? `${index * 60}ms` : "0ms" }}
              onClick={() => pick(skin.id)} onMouseEnter={() => setActive(index)}>
              {skin.name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
