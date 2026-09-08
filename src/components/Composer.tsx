import { useEffect, useState } from 'react';
import { Panel, Stepper, FileButton, StatusBar, Readout } from './ui';
import { VhsLab } from './VhsLab';
import { degradeImage, DEGRADE_PRESETS } from '../lib/degrade';
import { processImageData } from '../lib/pyntsc/render';
import { PARAM_PRESETS, PARAM_PRESET_NAMES } from '../lib/pyntsc/params';
import { putAsset, uid } from '../lib/db';
import type { Post } from '../lib/types';

const MODES = ['PHOTO', 'VIDEO', 'TEXT'] as const;
type Mode = (typeof MODES)[number];

function kb(n: number): string {
  return n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function Composer({ authorId, onPost }: { authorId: string; onPost: (p: Post) => void }) {
  const [mode, setMode] = useState<Mode>('PHOTO');
  const [caption, setCaption] = useState('');
  const [status, setStatus] = useState<{ tone: 'info' | 'warn' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  /* --- photo --- */
  const [photoPresetId, setPhotoPresetId] = useState(1);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<{ url: string; blob: Blob; w: number; h: number; from: number } | null>(null);
  /* Optional second pass: the degraded still through the Python signal chain. */
  const [compositePass, setCompositePass] = useState(false);
  const [compositePresetId, setCompositePresetId] = useState(PARAM_PRESET_NAMES.indexOf('VHS EP'));

  const photoPreset = DEGRADE_PRESETS[photoPresetId];


  /* Re-run degradation whenever the file or preset changes, so what is on
     screen is always the thing that would actually be posted. */
  useEffect(() => {
    if (!photoFile) return;
    let cancelled = false;
    let createdUrl: string | null = null;

    (async () => {
      setBusy(true);
      setStatus({ tone: 'info', text: 'Degrading…' });
      try {
        let res = await degradeImage(photoFile, photoPreset);
        if (cancelled) return;

        if (compositePass) {
          setStatus({ tone: 'info', text: 'Running composite pass in Python…' });
          const bitmap = await createImageBitmap(res.blob);
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
          ctx.drawImage(bitmap, 0, 0);
          bitmap.close();

          const processed = await processImageData(
            ctx.getImageData(0, 0, canvas.width, canvas.height),
            PARAM_PRESETS[PARAM_PRESET_NAMES[compositePresetId]],
          );
          if (cancelled) return;
          ctx.putImageData(processed, 0, 0);

          const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.7),
          );
          res = { ...res, blob, finalBytes: blob.size };
        }

        createdUrl = URL.createObjectURL(res.blob);
        setPhotoPreview((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return { url: createdUrl!, blob: res.blob, w: res.width, h: res.height, from: res.originalBytes };
        });
        setStatus(null);
      } catch (err) {
        if (!cancelled) setStatus({ tone: 'err', text: err instanceof Error ? err.message : 'could not process image' });
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => { cancelled = true; };
  }, [photoFile, photoPreset, compositePass, compositePresetId]);

  const postPhoto = async () => {
    if (!photoPreview || !photoFile) return;
    setBusy(true);
    try {
      const mediaAsset = await putAsset(photoPreview.blob, 'image', photoFile.name);
      const originalAsset = await putAsset(photoFile, 'image', `original-${photoFile.name}`);
      onPost({
        id: uid('p_'), authorId, createdAt: Date.now(), caption,
        kind: 'photo', mediaAsset, originalAsset,
        width: photoPreview.w, height: photoPreview.h,
      });
      URL.revokeObjectURL(photoPreview.url);
      setPhotoPreview(null);
      setPhotoFile(null);
      setCaption('');
      setStatus({ tone: 'info', text: 'Posted.' });
    } catch (err) {
      setStatus({ tone: 'err', text: err instanceof Error ? err.message : 'post failed' });
    } finally {
      setBusy(false);
    }
  };

  const postText = () => {
    if (!caption.trim()) return;
    onPost({
      id: uid('p_'), authorId, createdAt: Date.now(), caption,
      kind: 'text', mediaAsset: null, originalAsset: null,
    });
    setCaption('');
    setStatus({ tone: 'info', text: 'Posted.' });
  };

  return (
    <div className="stack">
      <div className="row row--wrap" style={{ gap: 4 }}>
        {MODES.map((m) => (
          <button
            key={m}
            className={`btn btn--sm ${m === mode ? 'btn--primary' : ''}`}
            onClick={() => setMode(m)}
          >
            {m}
          </button>
        ))}
      </div>

      {status && <StatusBar tone={status.tone}>{status.text}</StatusBar>}

      {/* ------------------------------------------------------------- photo */}
      {mode === 'PHOTO' && (
        <Panel title="UPLOAD PHOTO" riveted>
          <div className="row" style={{ gap: 6, marginBottom: 10 }}>
            <FileButton accept="image/*" className="btn btn--primary" onFile={(f) => setPhotoFile(f[0])}>
              CHOOSE IMAGE
            </FileButton>
            {photoFile && <span className="dim" style={{ fontSize: 11 }}>{photoFile.name}</span>}
          </div>

          <Stepper
            name="Camera"
            value={photoPresetId}
            options={DEGRADE_PRESETS.map((p) => p.name)}
            onChange={setPhotoPresetId}
          />

          <div className="stepper">
            <span className="stepper__name">Composite pass</span>
            <button
              className="stepper__value"
              style={{ cursor: 'pointer', color: compositePass ? 'var(--phos)' : '#4a554a', minWidth: 66 }}
              onClick={() => setCompositePass(!compositePass)}
            >
              {compositePass ? 'ON' : 'OFF'}
            </button>
          </div>
          {compositePass && (
            <Stepper
              name="Signal"
              value={compositePresetId}
              options={PARAM_PRESET_NAMES}
              onChange={setCompositePresetId}
            />
          )}

          {photoPreview && (
            <>
              <div className="crt" style={{ marginTop: 10, padding: 8 }}>
                <img
                  src={photoPreview.url}
                  alt="degraded preview"
                  style={{ width: '100%', display: 'block', imageRendering: 'pixelated' }}
                />
              </div>
              <div style={{ marginTop: 8 }}>
                <Readout label="OUTPUT" value={`${photoPreview.w}×${photoPreview.h}`} />
                <Readout label="WAS" value={kb(photoPreview.from)} accent="am" />
                <Readout label="NOW" value={kb(photoPreview.blob.size)} accent="mg" />
              </div>
            </>
          )}

          <div className="field" style={{ marginTop: 10 }}>
            <label>Caption</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="say something"
              style={{ minHeight: 56 }}
            />
          </div>

          <button className="btn btn--primary" style={{ width: '100%' }} disabled={!photoPreview || busy} onClick={postPhoto}>
            {busy ? 'WORKING…' : 'POST'}
          </button>
        </Panel>
      )}

      {mode === 'VIDEO' && <VhsLab authorId={authorId} onPost={onPost} />}

      {/* -------------------------------------------------------------- text */}
      {mode !== 'VIDEO' && (
        <Panel title="what happens to your uploads" riveted>
          <p style={{ fontSize: 12, lineHeight: 1.7, color: '#a4b096', margin: 0 }}>
            Photos are resampled to a period-appropriate sensor size, chroma is thrown away at
            quarter resolution, the palette is crushed and dithered, and the result is re-saved as
            JPEG — several times over on the harsher presets. Generation loss is doing the work,
            not a filter laid on top.
          </p>
          <hr className="hr" />
          <p style={{ fontSize: 12, lineHeight: 1.7, color: '#a4b096', margin: 0 }}>
            Switch on the composite pass and the still goes through the same Python NTSC emulator
            the video tools use — real dot crawl, ringing and chroma bleed rather than an
            approximation of them.
          </p>
          <hr className="hr" />
          <p className="dim" style={{ fontSize: 11, margin: 0 }}>
            Everything stays on this device. Media lives in IndexedDB, profile text in
            localStorage. Nothing is uploaded anywhere.
          </p>
        </Panel>
      )}

      {mode === 'TEXT' && (
        <Panel title="BULLETIN" riveted>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="what are you thinking about"
            style={{ minHeight: 110 }}
          />
          <button
            className="btn btn--primary"
            style={{ width: '100%', marginTop: 8 }}
            disabled={!caption.trim()}
            onClick={postText}
          >
            POST
          </button>
        </Panel>
      )}
    </div>
  );
}
