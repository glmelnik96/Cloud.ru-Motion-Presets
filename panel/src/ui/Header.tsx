// The header: the name of the panel and the format chip (spec 7). With an item open the chip is a button that opens
// the choice of the variant; without one it only tells which format the target has.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { FormatChip } from './format';

export interface HeaderProps {
  chip: FormatChip;
  onPick(key: string | null): void;
}

export function Header({ chip, onPick }: HeaderProps) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const options = chip.options;
  const pickable = options !== null;

  useEffect(() => {
    if (!pickable) setOpen(false);
  }, [pickable]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && e.target instanceof Node && !wrap.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <header class="header">
      <h1 class="title">Cloud.ru BrandKit</h1>
      <div class="chip-wrap" ref={wrap}>
        {pickable ? (
          <button
            type="button"
            class={'format ' + chip.tone}
            title={chip.title}
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <span class="format-text">{chip.text}</span>
            <span class="caret" aria-hidden="true">▾</span>
          </button>
        ) : (
          <span class={'format static ' + chip.tone} title={chip.title}>
            <span class="format-text">{chip.text}</span>
          </span>
        )}
        {open && options ? (
          <ul class="menu" role="listbox" aria-label="Вариант шаблона">
            {options.map((o) => (
              <li key={o.key ?? 'auto'} role="option" aria-selected={o.selected}>
                <button
                  type="button"
                  class={'menu-item' + (o.selected ? ' on' : '')}
                  onClick={() => {
                    setOpen(false);
                    onPick(o.key);
                  }}
                >
                  <span class="menu-label">{o.label}</span>
                  {o.hint ? <span class="menu-hint">{o.hint}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </header>
  );
}
