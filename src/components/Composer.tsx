import { useEffect, useRef, useState } from 'react';
import { Panel, Stepper, FileButton, StatusBar, Readout } from './ui';
import { VhsPreview } from './VhsPreview';
import { degradeImage, DEGRADE_PRESETS } from '../lib/degrade';
import { applyNtscToVideo } from '../lib/ntsc/renderer';
import { PRESETS, PRESET_NAMES } from '../lib/ntsc/presets';
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

  /* --- video --- */
  const [vhsPresetId, setVhsPresetId] = useState(2);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const videoUrlRef = useRef<string | null>(null);

  const photoPreset = DEGRADE_PRESETS[photoPresetId];
  const vhsPreset = PRESETS[PRESET_NAMES[vhsPresetId]];

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
        const res = await degradeImage(photoFile, photoPreset);
        if (cancelled) return;
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
  }, [photoFile, photoPreset]);

  useEffect(() => () => {
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
  }, []);

  const loadVideo = (file: File) => {
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    const url = URL.createObjectURL(file);
    videoUrlRef.current = url;

    const el = document.createElement('video');
    el.src = url;
    el.muted = true;
    el.loop = true;
    el.playsInline = true;
    el.onloadeddata = () => {
      el.play().catch(() => undefined);
      setVideoEl(el);
    };
    el.onerror = () => setStatus({ tone: 'err', text: 'That video would not decode. Try MP4 or WebM.' });
    setVideoFile(file);
  };

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

  const postVideo = async () => {
    if (!videoFile) return;
    setBusy(true);
    setProgress(0);
    setStatus({
      tone: 'warn',
      text: 'Encoding in real time — this takes as long as the clip does. Leave the tab open.',
    });
    try {
      const { blob, width, height } = await applyNtscToVideo(videoFile, vhsPreset, (p) => setProgress(p.progress));
      const mediaAsset = await putAsset(blob, 'video', videoFile.name);
      onPost({
        id: uid('p_'), authorId, createdAt: Date.now(), caption,
        kind: 'video', mediaAsset, originalAsset: null, width, height,
      });
      setVideoFile(null);
      setVideoEl(null);
      setCaption('');
      setStatus({ tone: 'info', text: `Posted — ${kb(blob.size)} of tape.` });
    } catch (err) {
      setStatus({ tone: 'err', text: err instanceof Error ? err.message : 'encode failed' });
    } finally {
      setBusy(false);
      setProgress(0);
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

      {/* ------------------------------------------------------------- video */}
      {mode === 'VIDEO' && (
        <Panel title="UPLOAD VIDEO" riveted>
          <div className="row" style={{ gap: 6, marginBottom: 10 }}>
            <FileButton accept="video/*" className="btn btn--primary" onFile={(f) => loadVideo(f[0])}>
              CHOOSE VIDEO
            </FileButton>
            {videoFile && <span className="dim" style={{ fontSize: 11 }}>{videoFile.name}</span>}
          </div>

          <Stepper name="Tape" value={vhsPresetId} options={PRESET_NAMES} onChange={setVhsPresetId} />

          {videoEl && (
            <div className="crt" style={{ marginTop: 10, aspectRatio: '4/3' }}>
              <VhsPreview video={videoEl} settings={vhsPreset} style={{ width: '100%', height: '100%' }} />
            </div>
          )}

          {busy && (
            <div style={{ marginTop: 10 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="dim" style={{ fontSize: 11 }}>ENCODING</span>
                <span className="glow" style={{ fontSize: 11 }}>{Math.round(progress * 100)}%</span>
              </div>
              <div style={{ height: 8, background: '#04060a', border: '1px solid #263042', marginTop: 3 }}>
                <div
                  style={{
                    height: '100%', width: `${progress * 100}%`,
                    background: 'linear-gradient(90deg,#2f8c3a,#6dff7a)',
                    boxShadow: '0 0 10px rgba(109,255,122,.6)',
                  }}
                />
              </div>
            </div>
          )}

          <div className="field" style={{ marginTop: 10 }}>
            <label>Caption</label>
            <textarea value={caption} onChange={(e) => setCaption(e.target.value)} style={{ minHeight: 56 }} />
          </div>

          <button className="btn btn--primary" style={{ width: '100%' }} disabled={!videoFile || busy} onClick={postVideo}>
            {busy ? `ENCODING ${Math.round(progress * 100)}%` : 'PROCESS & POST'}
          </button>

          <p className="dim" style={{ fontSize: 11, margin: '8px 0 0' }}>
            Encoding runs the clip through in real time and records the output, so a
            30-second video takes 30 seconds. Keep it short.
          </p>
        </Panel>
      )}

      {/* -------------------------------------------------------------- text */}
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
