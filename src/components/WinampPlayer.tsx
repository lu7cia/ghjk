import { useEffect, useRef, useState } from 'react';
import { previewPlayer } from '../lib/music';
import { assetUrl } from '../lib/db';
import type { Track } from '../lib/types';

/**
 * The player, built after a late-90s skinned media player: carved metal
 * fascia, a recessed LCD for the readouts, a segmented spectrum display and a
 * playlist docked underneath.
 */
export function WinampPlayer({ title, tracks }: { title: string; tracks: Track[] }) {
  const [playingId, setPlayingId] = useState<string | null>(previewPlayer.playingId);
  const [pos, setPos] = useState({ current: 0, duration: 0 });
  const [vol, setVol] = useState(previewPlayer.volume);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [bars, setBars] = useState<number[]>(() => new Array(34).fill(0.08));
  const raf = useRef(0);

  useEffect(() => previewPlayer.subscribe(setPlayingId), []);

  /* Uploaded tracks live in IndexedDB, so their URLs resolve lazily. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const t of tracks) {
        if (t.previewUrl) next[t.id] = t.previewUrl;
        else if (t.audioAsset) {
          const u = await assetUrl(t.audioAsset);
          if (u) next[t.id] = u;
        }
      }
      if (!cancelled) setUrls(next);
    })();
    return () => { cancelled = true; };
  }, [tracks]);

  /* Readouts and the spectrum display.
   *
   * The bars are generated rather than analysed: an iTunes preview is served
   * cross-origin, and routing it through a WebAudio graph to get real spectrum
   * data would mute it outright. A driven animation is honest enough for a
   * decorative meter and never costs the user their audio. */
  useEffect(() => {
    const tick = () => {
      raf.current = requestAnimationFrame(tick);
      setPos(previewPlayer.position);
      const t = performance.now() / 1000;
      setBars((prev) =>
        prev.map((v, i) => {
          if (!playingId) return Math.max(0.04, v * 0.88);
          const target =
            0.25 +
            0.42 * Math.abs(Math.sin(t * (1.7 + i * 0.11) + i)) * (1 - i / 46) +
            Math.random() * 0.2;
          // Fast attack, slow decay — the way a real meter behaves.
          return target > v ? target : v * 0.82 + target * 0.18;
        }),
      );
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playingId]);

  const index = tracks.findIndex((t) => t.id === playingId);
  const current = index >= 0 ? tracks[index] : null;

  const play = (t: Track) => {
    const url = urls[t.id];
    if (url) previewPlayer.toggle(t.id, url);
  };

  const step = (d: number) => {
    if (!tracks.length) return;
    const next = tracks[(Math.max(0, index) + d + tracks.length) % tracks.length];
    const url = urls[next.id];
    if (!url) return;
    if (playingId === next.id) return;
    previewPlayer.stop();
    previewPlayer.toggle(next.id, url);
  };

  const time = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <div className="panel wamp">
      <div className="wamp__bar">
        <span className="gothic wamp__title">{title}</span>
      </div>

      <div className="wamp__main">
        <div className="lcd wamp__time">{time(pos.current)}</div>

        <div className="wamp__mid">
          <div className="lcd wamp__track">
            <div className="marquee">
              <span>
                {current ? `${index + 1}. ${current.artist} — ${current.title}` : 'no track loaded'}
              </span>
            </div>
          </div>

          <div className="wamp__readouts">
            <span className="lcd">{current?.source === 'upload' ? '???' : '128'} kbps</span>
            <span className="lcd">44 kHz</span>
            <span className="lcd" style={{ flex: 1, textAlign: 'right' }}>
              {playingId ? 'STEREO' : 'MONO'}
            </span>
          </div>

          <div className="lcd wamp__spectrum">
            <div className="meter">
              {bars.map((v, i) => (
                <div key={i} className="meter__bar" style={{ height: `${Math.min(1, v) * 100}%` }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="wamp__transport">
        <button className="btn btn--sm" onClick={() => step(-1)} title="previous">|◀◀</button>
        <button
          className="btn btn--sm"
          onClick={() => current ? play(current) : tracks[0] && play(tracks[0])}
          title="play / pause"
        >
          {playingId ? '❚❚' : '▶'}
        </button>
        <button className="btn btn--sm" onClick={() => previewPlayer.stop()} title="stop">■</button>
        <button className="btn btn--sm" onClick={() => step(1)} title="next">▶▶|</button>
        <div className="wamp__vol">
          <span className="dim" style={{ fontSize: 10 }}>VOL</span>
          <input
            type="range" min={0} max={1} step={0.01} value={vol}
            onChange={(e) => { const v = parseFloat(e.target.value); setVol(v); previewPlayer.setVolume(v); }}
            aria-label="volume"
          />
        </div>
      </div>

      <div className="wamp__list scroll">
        {tracks.length === 0 && (
          <div className="dim" style={{ fontSize: 12, padding: '6px 8px' }}>playlist empty</div>
        )}
        {tracks.map((t, i) => {
          const on = t.id === playingId;
          const ready = Boolean(urls[t.id]);
          return (
            <button
              key={t.id}
              className={`wamp__row ${on ? 'wamp__row--on' : ''}`}
              onClick={() => play(t)}
              disabled={!ready}
            >
              <span className="wamp__num">{String(i + 1).padStart(2, '0')}.</span>
              <span className="wamp__name">
                {t.artist === 'YOU' ? t.title : `${t.artist} — ${t.title}`}
              </span>
              <span className="wamp__len">
                {on && pos.duration ? time(pos.duration) : ready ? (t.source === 'itunes' ? '0:30' : '--:--') : '···'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
