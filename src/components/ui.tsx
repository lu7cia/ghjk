import type { ReactNode, CSSProperties } from 'react';
import { useRef } from 'react';

/* ------------------------------------------------------------------- panel */

export function Panel({
  title, children, right, riveted, sunk, style, className = '', bodyStyle,
}: {
  title?: string;
  children: ReactNode;
  right?: ReactNode;
  riveted?: boolean;
  sunk?: boolean;
  style?: CSSProperties;
  className?: string;
  bodyStyle?: CSSProperties;
}) {
  return (
    <div
      className={`panel ${sunk ? 'panel--sunk' : ''} ${riveted ? 'panel--riveted' : ''} ${className}`}
      style={style}
    >
      {title && (
        <div className="panel__title">
          <span className="grow">{title}</span>
          {right}
        </div>
      )}
      <div className="panel__body" style={bodyStyle}>{children}</div>
    </div>
  );
}

/* ----------------------------------------------------------------- stepper */

export function Stepper({
  name, value, options, onChange,
}: {
  name: string;
  value: number;
  options: readonly string[];
  onChange: (v: number) => void;
}) {
  const n = options.length;
  const step = (d: number) => onChange((value + d + n) % n);
  return (
    <div className="stepper">
      <span className="stepper__name">{name}</span>
      <div className="stepper__ctrl">
        <button className="stepper__arrow" onClick={() => step(-1)} aria-label={`previous ${name}`}>«</button>
        <span className="stepper__value">{options[value % n]}</span>
        <button className="stepper__arrow" onClick={() => step(1)} aria-label={`next ${name}`}>»</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ slider */

export function Slider({
  name, value, onChange, min = 0, max = 1, step = 0.01, format,
}: {
  name: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 2 }}>
        <span className="stepper__name">{name}</span>
        <span className="glow-cy" style={{ fontSize: 12 }}>
          {format ? format(value) : Math.round(((value - min) / (max - min)) * 100) + '%'}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-label={name}
      />
    </div>
  );
}

/* --------------------------------------------------------------- swatches */

export function Swatches({
  colors, value, onChange,
}: {
  colors: readonly string[];
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="swatches">
      {colors.map((c) => (
        <button
          key={c}
          className={`swatch ${c.toLowerCase() === value.toLowerCase() ? 'swatch--on' : ''}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
          aria-label={c}
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- file input */

export function FileButton({
  accept, onFile, children, className = 'btn', multiple = false,
}: {
  accept: string;
  onFile: (files: File[]) => void;
  children: ReactNode;
  className?: string;
  multiple?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className={className} onClick={() => ref.current?.click()}>{children}</button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFile(files);
          e.target.value = '';
        }}
      />
    </>
  );
}

/* -------------------------------------------------------------------- tabs */

export function Tabs<T extends string>({
  tabs, value, onChange,
}: {
  tabs: readonly T[];
  value: T;
  onChange: (t: T) => void;
}) {
  return (
    <div className="row row--wrap" style={{ gap: 4 }}>
      {tabs.map((t) => (
        <button
          key={t}
          className={`btn btn--sm ${t === value ? 'btn--primary' : ''}`}
          onClick={() => onChange(t)}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ toggle */

export function Toggle({
  name, value, onChange,
}: {
  name: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      className="stepper"
      onClick={() => onChange(!value)}
      style={{ width: '100%', background: 'none', border: 0, cursor: 'pointer', padding: '3px 0' }}
    >
      <span className="stepper__name">{name}</span>
      <span className="stepper__value" style={{ minWidth: 66, color: value ? 'var(--phos)' : '#5a6472' }}>
        {value ? 'ON' : 'OFF'}
      </span>
    </button>
  );
}

/* ---------------------------------------------------------------- readouts */

export function Readout({ label, value, accent = 'cy' }: { label: string; value: string; accent?: 'cy' | 'mg' | 'am' | '' }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', borderBottom: '1px solid #1c2432', padding: '2px 0' }}>
      <span className="dim" style={{ fontSize: 12, letterSpacing: '.1em' }}>{label}</span>
      <span className={accent ? `glow-${accent}` : 'glow'} style={{ fontSize: 13 }}>{value}</span>
    </div>
  );
}

/** Full-bleed status strip, for progress and errors. */
export function StatusBar({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'err'; children: ReactNode }) {
  const color = tone === 'err' ? '#ff7a88' : tone === 'warn' ? 'var(--amber)' : 'var(--cyan)';
  return (
    <div
      className="row"
      style={{
        border: `1px solid ${color}44`, background: '#04060a', color,
        padding: '4px 10px', fontSize: 12, letterSpacing: '.06em',
      }}
    >
      <span className="blink">▸</span>
      <span className="grow">{children}</span>
    </div>
  );
}
