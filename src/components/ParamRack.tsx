import { useState } from 'react';
import type { NtscParams, ParamGroup, ParamSpec } from '../lib/pyntsc/params';

/** One collapsible rack of controls, mapped straight onto Ntsc's fields. */
export function ParamRack({
  group, params, onChange, defaultOpen = false,
}: {
  group: ParamGroup;
  params: NtscParams;
  onChange: (patch: Partial<NtscParams>) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="panel panel--riveted">
      <button
        className="panel__title"
        onClick={() => setOpen(!open)}
        style={{ width: '100%', cursor: 'pointer', border: 0, textAlign: 'left' }}
      >
        <span className="grow">{group.name.toLowerCase()}</span>
        <span className="dim" style={{ fontSize: 13 }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="panel__body" style={{ paddingTop: 8 }}>
          {group.specs.map((spec) => (
            <ParamControl key={spec.key} spec={spec} params={params} onChange={onChange} />
          ))}
        </div>
      )}
    </div>
  );
}

function formatValue(spec: ParamSpec, v: number): string {
  if (spec.key === 'composite_preemphasis_cut') return `${(v / 1_000_000).toFixed(2)} MHz`;
  if (spec.max !== undefined && spec.max >= 1000) return String(Math.round(v));
  if (spec.step !== undefined && spec.step >= 1) return String(Math.round(v));
  return v.toFixed(2);
}

function ParamControl({
  spec, params, onChange,
}: {
  spec: ParamSpec;
  params: NtscParams;
  onChange: (patch: Partial<NtscParams>) => void;
}) {
  const value = params[spec.key];

  if (spec.kind === 'toggle') {
    const on = Boolean(value);
    return (
      <div className="stepper" title={spec.hint}>
        <span className="stepper__name">{spec.label}</span>
        <button
          className="stepper__value"
          onClick={() => onChange({ [spec.key]: !on } as Partial<NtscParams>)}
          style={{ cursor: 'pointer', color: on ? 'var(--phos)' : '#4a554a', minWidth: 66 }}
        >
          {on ? 'ON' : 'OFF'}
        </button>
      </div>
    );
  }

  if (spec.kind === 'choice') {
    const choices = spec.choices ?? [];
    const idx = Math.max(0, choices.findIndex((c) => String(c) === String(value)));
    const step = (d: number) => {
      const next = choices[(idx + d + choices.length) % choices.length];
      onChange({ [spec.key]: next } as unknown as Partial<NtscParams>);
    };
    return (
      <div className="stepper" title={spec.hint}>
        <span className="stepper__name">{spec.label}</span>
        <div className="stepper__ctrl">
          <button className="stepper__arrow" onClick={() => step(-1)}>«</button>
          <span className="stepper__value" style={{ minWidth: 74 }}>{String(choices[idx])}</span>
          <button className="stepper__arrow" onClick={() => step(1)}>»</button>
        </div>
      </div>
    );
  }

  const num = Number(value);
  return (
    <div style={{ marginBottom: 7 }} title={spec.hint}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 1 }}>
        <span className="stepper__name">{spec.label}</span>
        <span className="glow" style={{ fontSize: 12 }}>{formatValue(spec, num)}</span>
      </div>
      <input
        type="range"
        min={spec.min} max={spec.max} step={spec.step}
        value={num}
        onChange={(e) => onChange({ [spec.key]: parseFloat(e.target.value) } as unknown as Partial<NtscParams>)}
        aria-label={spec.label}
      />
    </div>
  );
}
