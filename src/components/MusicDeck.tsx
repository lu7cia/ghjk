import { useEffect, useState } from 'react';
import { Panel, FileButton, StatusBar } from './ui';
import { WinampPlayer } from './WinampPlayer';
import { searchTracks, previewPlayer } from '../lib/music';
import { putAsset, uid, assetUrl } from '../lib/db';
import type { Track } from '../lib/types';

interface Props {
  favourites: (Track | null)[];
  ownTracks: Track[];
  onFavourites: (t: (Track | null)[]) => void;
  onOwnTracks: (t: Track[]) => void;
  editable?: boolean;
}

/** Shared subscription to the single preview <audio>, so every play button in
 *  the tree agrees on what is currently sounding. */
function usePlayingId(): string | null {
  const [id, setId] = useState<string | null>(previewPlayer.playingId);
  useEffect(() => previewPlayer.subscribe(setId), []);
  return id;
}

export function MusicDeck({ favourites, ownTracks, onFavourites, onOwnTracks, editable = true }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [slot, setSlot] = useState(0);
  const playingId = usePlayingId();

  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      const found = await searchTracks(query, 24);
      setResults(found);
      if (!found.length) setStatus('Nothing came back. Try a different spelling.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'search failed');
    } finally {
      setBusy(false);
    }
  };

  const assign = (track: Track) => {
    const next = [...favourites];
    next[slot] = track;
    onFavourites(next);
    setStatus(`Slot ${slot + 1} → ${track.title}`);
  };

  const uploadOwn = async (files: File[]) => {
    setStatus(`Uploading ${files.length} file(s)…`);
    try {
      const added: Track[] = [];
      for (const file of files) {
        const assetId = await putAsset(file, 'audio', file.name);
        const url = await assetUrl(assetId);
        added.push({
          id: uid('own_'),
          // Strip the extension — a filename is the closest thing to a title
          // we have without reading ID3 tags.
          title: file.name.replace(/\.[^.]+$/, ''),
          artist: 'YOU',
          artworkUrl: null,
          previewUrl: url,
          source: 'upload',
          audioAsset: assetId,
        });
      }
      onOwnTracks([...ownTracks, ...added]);
      setStatus(`${added.length} track(s) added to your player.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'upload failed');
    }
  };

  const playlist = [...favourites.filter((t): t is Track => Boolean(t)), ...ownTracks];

  return (
    <div className="stack">
      {status && <StatusBar>{status}</StatusBar>}

      <WinampPlayer title="the silence" tracks={playlist} />

      {/* ---------------------------------------------------------- top three */}
      <Panel title="TOP 3" riveted>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[0, 1, 2].map((i) => {
            const t = favourites[i];
            const active = editable && slot === i;
            return (
              <div
                key={i}
                onClick={() => editable && setSlot(i)}
                className="panel panel--sunk"
                style={{
                  padding: 6,
                  cursor: editable ? 'pointer' : 'default',
                  outline: active ? '1px solid var(--phos)' : 'none',
                  boxShadow: active ? '0 0 12px rgba(85,255,98,.4)' : undefined,
                }}
              >
                <div
                  className="center"
                  style={{
                    aspectRatio: '1', background: '#030603', marginBottom: 6,
                    border: '1px solid #1e2a1a', overflow: 'hidden', position: 'relative',
                  }}
                >
                  {t?.artworkUrl ? (
                    <img
                      src={t.artworkUrl}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover', imageRendering: 'pixelated' }}
                    />
                  ) : (
                    <span className="dim" style={{ fontSize: 26 }}>{i + 1}</span>
                  )}

                </div>
                <div className="glow" style={{ fontSize: 12, lineHeight: 1.25, overflowWrap: 'anywhere' }}>
                  {t?.title ?? <span className="dim">EMPTY SLOT</span>}
                </div>
                <div className="dim" style={{ fontSize: 11, overflowWrap: 'anywhere' }}>{t?.artist ?? ''}</div>
                {editable && t && (
                  <button
                    className="btn btn--sm btn--danger"
                    style={{ marginTop: 5, width: '100%' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const next = [...favourites];
                      next[i] = null;
                      onFavourites(next);
                    }}
                  >
                    CLEAR
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {editable && (
          <p className="dim" style={{ fontSize: 11, margin: '8px 0 0' }}>
            Slot {slot + 1} is selected — pick a track below to fill it. Previews are the
            30-second clips from the iTunes catalogue.
          </p>
        )}
      </Panel>

      {/* ------------------------------------------------------------ search */}
      {editable && (
        <Panel title="CATALOGUE SEARCH" riveted>
          <div className="row" style={{ gap: 6, marginBottom: 8 }}>
            <input
              type="search"
              className="grow"
              placeholder="artist, title, anything"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
            />
            <button className="btn btn--primary" onClick={search} disabled={busy}>
              {busy ? '…' : 'SEARCH'}
            </button>
          </div>

          <div className="scroll" style={{ maxHeight: 280 }}>
            {results.map((t) => (
              <div
                key={t.id}
                className="row"
                style={{ gap: 8, padding: '4px 0', borderBottom: '1px solid #1a2216' }}
              >
                {t.artworkUrl && (
                  <img
                    src={t.artworkUrl}
                    alt=""
                    width={34}
                    height={34}
                    style={{ imageRendering: 'pixelated', border: '1px solid #1e2a1a' }}
                  />
                )}
                <div className="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#cbd8bd', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t.title}
                  </div>
                  <div className="dim" style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t.artist}
                  </div>
                </div>
                {t.previewUrl ? (
                  <button
                    className="btn btn--sm"
                    onClick={() => previewPlayer.toggle(t.id, t.previewUrl!)}
                    title="preview"
                  >
                    {playingId === t.id ? '❚❚' : '▶'}
                  </button>
                ) : (
                  <span className="dim" style={{ fontSize: 10 }}>NO CLIP</span>
                )}
                <button className="btn btn--sm btn--primary" onClick={() => assign(t)}>
                  PIN {slot + 1}
                </button>
              </div>
            ))}
            {!results.length && !busy && (
              <p className="dim" style={{ fontSize: 12, margin: 0 }}>
                No results yet.
              </p>
            )}
          </div>
        </Panel>
      )}

      {/* --------------------------------------------------------- own music */}
      <Panel
        title="MY OWN MUSIC"
        riveted
        right={
          editable ? (
            <FileButton accept="audio/*" multiple className="btn btn--sm" onFile={uploadOwn}>
              UPLOAD
            </FileButton>
          ) : undefined
        }
      >
        {ownTracks.length === 0 ? (
          <p className="dim" style={{ fontSize: 12, margin: 0 }}>
            {editable
              ? 'Nothing uploaded. Drop in anything you have made — it plays right here on your page.'
              : 'This user has not uploaded any of their own music.'}
          </p>
        ) : (
          <div className="stack" style={{ gap: 4 }}>
            {ownTracks.map((t, i) => (
              <div key={t.id} className="row" style={{ gap: 8 }}>
                <span className="dim" style={{ fontSize: 11, width: 18 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <OwnTrackButton track={t} playingId={playingId} />
                <span className="grow" style={{ fontSize: 12, color: '#cbd8bd', overflowWrap: 'anywhere' }}>
                  {t.title}
                </span>
                {editable && (
                  <button
                    className="btn btn--sm btn--danger"
                    onClick={() => onOwnTracks(ownTracks.filter((x) => x.id !== t.id))}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

/** Uploaded tracks live in IndexedDB, so their object URL has to be resolved
 *  lazily rather than stored in the profile JSON. */
function OwnTrackButton({ track, playingId }: { track: Track; playingId: string | null }) {
  const [url, setUrl] = useState<string | null>(track.previewUrl);

  useEffect(() => {
    if (!url && track.audioAsset) {
      assetUrl(track.audioAsset).then(setUrl);
    }
  }, [track.audioAsset, url]);

  return (
    <button
      className="btn btn--sm"
      disabled={!url}
      onClick={() => url && previewPlayer.toggle(track.id, url)}
    >
      {playingId === track.id ? '❚❚' : '▶'}
    </button>
  );
}
