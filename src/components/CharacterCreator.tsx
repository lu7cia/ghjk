import { useState } from 'react';
import { CharacterCanvas } from '../character/CharacterCanvas';
import {
  SKIN_TONES, HAIR_COLORS, FABRIC_COLORS,
  HAIR_STYLES, TOP_STYLES, BOTTOM_STYLES, ACCESSORIES,
} from '../character/rig';
import { FACE_PRESETS } from '../character/faces';
import { Panel, Stepper, Slider, Swatches, FileButton, Tabs, Toggle, StatusBar } from './ui';
import { useAssetImage } from '../lib/hooks';
import { putAsset } from '../lib/db';
import { degradeImage, DEGRADE_PRESETS } from '../lib/degrade';
import type { CharacterConfig, HabitatConfig } from '../lib/types';

const TABS = ['BODY', 'FACE', 'HAIR', 'WEAR', 'SIGNAL'] as const;
type Tab = (typeof TABS)[number];

interface Props {
  character: CharacterConfig;
  habitat: HabitatConfig;
  onChange: (c: CharacterConfig) => void;
}

export function CharacterCreator({ character, habitat, onChange }: Props) {
  const [tab, setTab] = useState<Tab>('BODY');
  const [status, setStatus] = useState<string | null>(null);

  const topImage = useAssetImage(character.topTextureAsset);
  const bottomImage = useAssetImage(character.bottomTextureAsset);

  const set = <K extends keyof CharacterConfig>(key: K, value: CharacterConfig[K]) =>
    onChange({ ...character, [key]: value });

  /** Clothing textures get the same lo-fi treatment as everything else, so an
   *  uploaded photo sits on the model like era-appropriate texture art. */
  const uploadFabric = async (slot: 'top' | 'bottom', file: File) => {
    setStatus(`Processing ${file.name}…`);
    try {
      const preset = DEGRADE_PRESETS.find((p) => p.name === 'WEBCAM 1999')!;
      const { blob } = await degradeImage(file, { ...preset, maxEdge: 128, vignette: 0, grain: 6 });
      const id = await putAsset(blob, 'image', file.name);
      onChange({
        ...character,
        [slot === 'top' ? 'topTextureAsset' : 'bottomTextureAsset']: id,
      });
      setStatus(`${file.name} mapped to ${slot}.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'texture upload failed');
    }
  };

  return (
    <div className="editor-split">
      {/* ---------------------------------------------------------- viewport */}
      <Panel
        title="SUBJECT / RENDER"
        right={<span className="dim" style={{ fontSize: 11 }}>DRAG TO ROTATE</span>}
        bodyStyle={{ padding: 8 }}
        className="editor-split__pane"
      >
        <div className="crt" style={{ aspectRatio: '4/3', position: 'relative' }}>
          <CharacterCanvas
            character={character}
            habitat={habitat}
            topImage={topImage}
            bottomImage={bottomImage}
            internalWidth={320}
            internalHeight={240}
          />
          <div className="noise-veil" />
          <div style={{ position: 'absolute', left: 8, top: 6, zIndex: 7, pointerEvents: 'none' }}>
            <div className="glow" style={{ fontSize: 11, letterSpacing: '.16em' }}>REC ●</div>
            <div className="dim" style={{ fontSize: 10 }}>{habitat.label}</div>
          </div>
          <div
            style={{ position: 'absolute', right: 8, bottom: 6, zIndex: 7, pointerEvents: 'none' }}
            className="glow-cy"
          >
            <span style={{ fontSize: 10 }}>320×240 · {character.colorDepth}BPC</span>
          </div>
        </div>
      </Panel>

      {/* ---------------------------------------------------------- controls */}
      <div className="stack scroll editor-split__rail">
        <Tabs tabs={TABS} value={tab} onChange={setTab} />

        {status && <StatusBar>{status}</StatusBar>}

        {tab === 'BODY' && (
          <Panel title="CHASSIS" riveted>
            <div className="field">
              <label>Skin</label>
              <Swatches colors={SKIN_TONES} value={character.skinTone} onChange={(c) => set('skinTone', c)} />
            </div>
            <hr className="hr" />
            <Slider name="Build" value={character.build} onChange={(v) => set('build', v)} />
            <Slider name="Height" value={character.height} onChange={(v) => set('height', v)} />
          </Panel>
        )}

        {tab === 'FACE' && (
          <Panel title="FACE MAP" riveted>
            <Stepper
              name="Preset"
              value={character.faceId}
              options={FACE_PRESETS}
              onChange={(v) => set('faceId', v)}
            />
            <hr className="hr" />
            <Slider name="Brow" value={character.browHeight} onChange={(v) => set('browHeight', v)} />
            <Slider name="Eye spacing" value={character.eyeSpacing} onChange={(v) => set('eyeSpacing', v)} />
            <Slider name="Jaw" value={character.jaw} onChange={(v) => set('jaw', v)} />
            <p className="dim" style={{ fontSize: 11, marginBottom: 0 }}>
              The face is a 128×128 texture, not geometry — same as it was on the hardware.
            </p>
          </Panel>
        )}

        {tab === 'HAIR' && (
          <Panel title="HAIR" riveted>
            <Stepper name="Style" value={character.hairId} options={HAIR_STYLES} onChange={(v) => set('hairId', v)} />
            <hr className="hr" />
            <div className="field">
              <label>Colour</label>
              <Swatches colors={HAIR_COLORS} value={character.hairColor} onChange={(c) => set('hairColor', c)} />
            </div>
          </Panel>
        )}

        {tab === 'WEAR' && (
          <>
            <Panel title="UPPER" riveted>
              <Stepper name="Garment" value={character.topId} options={TOP_STYLES} onChange={(v) => set('topId', v)} />
              <div className="field" style={{ marginTop: 8 }}>
                <label>Colour</label>
                <Swatches colors={FABRIC_COLORS} value={character.topColor} onChange={(c) => set('topColor', c)} />
              </div>
              <div className="row" style={{ gap: 6 }}>
                <FileButton
                  accept="image/*"
                  className="btn btn--sm grow"
                  onFile={(f) => uploadFabric('top', f[0])}
                >
                  {character.topTextureAsset ? 'REPLACE FABRIC' : 'UPLOAD FABRIC'}
                </FileButton>
                {character.topTextureAsset && (
                  <button className="btn btn--sm btn--danger" onClick={() => set('topTextureAsset', null)}>
                    CLEAR
                  </button>
                )}
              </div>
            </Panel>

            <Panel title="LOWER" riveted>
              <Stepper name="Garment" value={character.bottomId} options={BOTTOM_STYLES} onChange={(v) => set('bottomId', v)} />
              <div className="field" style={{ marginTop: 8 }}>
                <label>Colour</label>
                <Swatches colors={FABRIC_COLORS} value={character.bottomColor} onChange={(c) => set('bottomColor', c)} />
              </div>
              <div className="row" style={{ gap: 6 }}>
                <FileButton
                  accept="image/*"
                  className="btn btn--sm grow"
                  onFile={(f) => uploadFabric('bottom', f[0])}
                >
                  {character.bottomTextureAsset ? 'REPLACE FABRIC' : 'UPLOAD FABRIC'}
                </FileButton>
                {character.bottomTextureAsset && (
                  <button className="btn btn--sm btn--danger" onClick={() => set('bottomTextureAsset', null)}>
                    CLEAR
                  </button>
                )}
              </div>
            </Panel>

            <Panel title="HARDWARE" riveted>
              <Stepper
                name="Accessory"
                value={character.accessoryId}
                options={ACCESSORIES}
                onChange={(v) => set('accessoryId', v)}
              />
              <div className="field" style={{ marginTop: 8 }}>
                <label>Finish</label>
                <Swatches
                  colors={FABRIC_COLORS}
                  value={character.accessoryColor}
                  onChange={(c) => set('accessoryColor', c)}
                />
              </div>
            </Panel>
          </>
        )}

        {tab === 'SIGNAL' && (
          <Panel title="RASTERISER" riveted>
            <Slider
              name="Vertex jitter"
              value={character.vertexJitter}
              onChange={(v) => set('vertexJitter', v)}
            />
            <Slider
              name="Colour depth"
              value={character.colorDepth}
              min={2} max={8} step={1}
              onChange={(v) => set('colorDepth', v)}
              format={(v) => `${v} bit`}
            />
            <Slider name="Dither" value={character.dither} onChange={(v) => set('dither', v)} />
            <hr className="hr" />
            <Toggle name="Turntable" value={character.turntable} onChange={(v) => set('turntable', v)} />
            <p className="dim" style={{ fontSize: 11, marginTop: 8, marginBottom: 0 }}>
              Vertex jitter snaps geometry to a 320×240 grid, exactly like a console with no
              sub-pixel precision. Turn it off and the wobble goes with it.
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}
