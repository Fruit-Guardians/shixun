'use client';

import { Check, Palette as PaletteIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PALETTES } from '../lib/theme.ts';
import type { Palette } from '../lib/theme.ts';

interface PalettePickerProps {
  palette: Palette;
  onChange: (next: Palette) => void;
}

/** 顶栏的配色方案菜单：每套方案都有浅色与深色两种形态，和明暗切换互相独立。 */
export default function PalettePicker({ palette, onChange }: PalettePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="palette-picker" ref={rootRef}>
      <button
        className="btn btn-ghost btn-icon"
        aria-label="切换配色方案"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <PaletteIcon size={17} />
      </button>
      {open && (
        <div className="palette-menu" role="radiogroup" aria-label="配色方案">
          <p className="palette-menu-title">$ theme --palette</p>
          {PALETTES.map((p) => (
            <button
              key={p.id}
              role="radio"
              aria-checked={palette === p.id}
              className={palette === p.id ? 'on' : ''}
              onClick={() => {
                onChange(p.id);
                setOpen(false);
              }}
            >
              <span className="palette-swatch" data-p={p.id} aria-hidden="true">
                &gt;_
              </span>
              <span className="palette-name">
                {p.label}
                <small>{p.hint}</small>
              </span>
              {palette === p.id && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
