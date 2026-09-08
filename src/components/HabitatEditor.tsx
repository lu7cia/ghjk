import { useState } from 'react';
import { CharacterCanvas } from '../character/CharacterCanvas';
import { HABITAT_PRESETS } from '../character/habitat';
import { Panel, Stepper, Slider, Swatches, FileButton, StatusBar } from './ui';
import { useAssetImage } from '../lib/hooks';
import { putAsset } from '../lib/db';
import { degradeImage, DEGRADE_PRESETS } from '../lib/degrade';
import type { CharacterConfig, HabitatConfig } from '../lib/types';

const FOG_COLORS = [
  'var(--void)', '#141821', '#1c1410', '#2a0a12', '#0a1a12',
  '#101a2a', '#1a0f24', '#241a0a', '#0e0e0e', '#2a2a2f',
];

const LIGHT_COLORS = [
  '#cfe4ff', '#ffffff', '#ffd9a8', '#ff9a8a', '#a8ffc4',
  '#9ad8ff', '#ffb0e8', '#c4ff8a', '#ff5a5a', '#6dff7a',
];

interface Props {
  character: CharacterConfig;
  habitat: HabitatConfig;
  onChange: (h: HabitatConfig) => void;
}

export function HabitatEditor({ character, habitat, onChange }: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const backdrop = useAssetImage(habitat.backdropAsset);
  const topImage = useAssetImage(character.topTextureAsset);
  const bottomImage = useAssetImage(character.bottomTextureAsset);

  const set = <K extends keyof HabitatConfig>(key: K, value: HabitatConfig[K]) =>
    onChange({ ...habitat, [key]: value });

  const uploadBackdrop = async (file: File) => {
    setStatus(`Ingesting ${file.name}…`);
    try {
      // Backdrops go through the same degradation as photos — a crisp 4K
      // backdrop behind a 300-poly character looks wrong in a way that is hard
      // to unsee.
      const preset = DEGRADE_PRESETS.find((p) => p.name === 'DIGICAM 2003')!;
      const { blob, width, height } = await degradeImage(file, {
        ...preset, maxEdge: 512, colorDepth: 6, dither: 0.5, grain: 8,
      });
      const id = await putAsset(blob, 'image', file.name);
      set('backdropAsset', id);
      setStatus(`Backdrop set — ${width}×${height}.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'backdrop upload failed');
    }
  };

  return (
    <div className="editor-split">
      <Panel
        title="HABITAT / PREVIEW"
        bodyStyle={{ padding: 8 }}
        className="editor-split__pane"
      >
        <div className="crt" style={{ aspectRatio: '4/3', position: 'relative' }}>
          <CharacterCanvas
            character={character}
            habitat={habitat}
            backdropImage={backdrop}
            topImage={topImage}
            bottomImage={bottomImage}
            internalWidth={320}
            internalHeight={240}
          />
          <div className="noise-veil" />
          <div
            style={{ position: 'absolute', left: 8, bottom: 6, zIndex: 7, pointerEvents: 'none' }}
            className="glow"
          >
            <span style={{ fontSize: 11, letterSpacing: '.14em' }}>{habitat.label || 'UNNAMED'}</span>
          </div>
        </div>
      </Panel>

      <div className="stack scroll editor-split__rail">
        {status && <StatusBar>{status}</StatusBar>}

        <Panel title="LOCATION" riveted>
          <Stepper
            name="Preset"
            value={habitat.presetId}
            options={HABITAT_PRESETS}
            onChange={(v) => set('presetId', v)}
          />
          <div className="field" style={{ marginTop: 10 }}>
            <label>Sign</label>
            <input
              type="text"
              value={habitat.label}
              maxLength={40}
              placeholder="SECTOR 7 / SUBLEVEL 3"
              onChange={(e) => set('label', e.target.value)}
            />
          </div>
          <div className="row" style={{ gap: 6 }}>
            <FileButton accept="image/*" className="btn btn--sm grow" onFile={(f) => uploadBackdrop(f[0])}>
              {habitat.backdropAsset ? 'REPLACE BACKDROP' : 'UPLOAD BACKDROP'}
            </FileButton>
            {habitat.backdropAsset && (
              <button className="btn btn--sm btn--danger" onClick={() => set('backdropAsset', null)}>
                CLEAR
              </button>
            )}
          </div>
          {habitat.backdropAsset && (
            <p className="dim" style={{ fontSize: 11, margin: '8px 0 0' }}>
              Your image is overriding the preset.
            </p>
          )}
        </Panel>

        <Panel title="ATMOSPHERE" riveted>
          <div className="field">
            <label>Fog</label>
            <Swatches colors={FOG_COLORS} value={habitat.fogColor} onChange={(c) => set('fogColor', c)} />
          </div>
          <Slider name="Fog density" value={habitat.fogDensity} onChange={(v) => set('fogDensity', v)} />
          <hr className="hr" />
          <div className="field">
            <label>Key light</label>
            <Swatches colors={LIGHT_COLORS} value={habitat.lightColor} onChange={(c) => set('lightColor', c)} />
          </div>
          <Slider
            name="Intensity"
            value={habitat.lightIntensity}
            min={0} max={2} step={0.05}
            onChange={(v) => set('lightIntensity', v)}
            format={(v) => v.toFixed(2) + '×'}
          />
          <p className="dim" style={{ fontSize: 11, marginBottom: 0 }}>
            Dense fog was how these games hid a short draw distance. Here it just makes
            everything look better, which was always the other reason.
          </p>
        </Panel>
      </div>
    </div>
  );
}
