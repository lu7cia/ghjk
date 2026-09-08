import { useEffect, useMemo, useState } from 'react';
import { CharacterCreator } from './components/CharacterCreator';
import { HabitatEditor } from './components/HabitatEditor';
import { Composer } from './components/Composer';
import { ProfileView } from './components/ProfileView';
import { Feed } from './components/Feed';
import { Panel } from './components/ui';
import { loadState, saveState, wipeState } from './lib/db';
import { seedState } from './data/seed';
import { previewPlayer } from './lib/music';
import type { AppState, Post } from './lib/types';

const VIEWS = ['PAGE', 'CREATOR', 'HABITAT', 'BROADCAST', 'CHANNELS'] as const;
type View = (typeof VIEWS)[number];

export function App() {
  const [state, setState] = useState<AppState>(() => loadState() ?? seedState());
  const [view, setView] = useState<View>('PAGE');
  /** When set, we are looking at somebody else's page rather than our own. */
  const [visiting, setVisiting] = useState<string | null>(null);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const viewingProfile = useMemo(
    () => (visiting ? state.others.find((p) => p.id === visiting) ?? state.me : state.me),
    [visiting, state],
  );

  const visiblePosts = useMemo(
    () => state.posts.filter((p) => p.authorId === viewingProfile.id).sort((a, b) => b.createdAt - a.createdAt),
    [state.posts, viewingProfile.id],
  );

  const addPost = (post: Post) => {
    setState((s) => ({ ...s, posts: [post, ...s.posts] }));
    setVisiting(null);
    setView('PAGE');
  };

  const go = (v: View) => {
    setVisiting(null);
    setView(v);
    previewPlayer.stop();
  };

  const reset = () => {
    if (!confirm('Wipe your character, profile and every post on this device? This cannot be undone.')) return;
    wipeState();
    location.reload();
  };

  return (
    <div
      style={{
        position: 'relative', zIndex: 1, height: '100%',
        display: 'flex', flexDirection: 'column', padding: 12, gap: 10,
      }}
    >
      {/* ------------------------------------------------------------ header */}
      <div className="row" style={{ gap: 12, flexShrink: 0 }}>
        <div>
          <div className="chroma" style={{ fontSize: 32, lineHeight: 0.9 }}>GHJK</div>
          <div className="dim" style={{ fontSize: 10, letterSpacing: '.28em' }}>PERSONAL BROADCAST TERMINAL</div>
        </div>

        <div className="grow marquee dim" style={{ fontSize: 11 }}>
          <span>
            ▸ SIGNAL NOMINAL ▸ {state.others.length + 1} INHABITANTS ONLINE ▸ {state.posts.length} TRANSMISSIONS
            ARCHIVED ▸ TAPE HEADS CLEANED 04:12 ▸ DO NOT ADJUST YOUR SET ▸
          </span>
        </div>

        <div className="row row--wrap" style={{ gap: 4, justifyContent: 'flex-end' }}>
          {VIEWS.map((v) => (
            <button
              key={v}
              className={`btn btn--sm ${v === view && !visiting ? 'btn--primary' : ''}`}
              onClick={() => go(v)}
            >
              {v}
            </button>
          ))}
          <button className="btn btn--sm btn--danger" onClick={reset} title="wipe local data">
            WIPE
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------- body */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {visiting ? (
          <div className="stack" style={{ height: '100%' }}>
            <div className="row" style={{ flexShrink: 0 }}>
              <button className="btn btn--sm" onClick={() => { setVisiting(null); previewPlayer.stop(); }}>
                « BACK TO CHANNELS
              </button>
              <span className="dim grow" style={{ fontSize: 11, textAlign: 'right' }}>
                VIEWING @{viewingProfile.handle}
              </span>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <ProfileView profile={viewingProfile} posts={visiblePosts} editable={false} />
            </div>
          </div>
        ) : view === 'PAGE' ? (
          <ProfileView
            profile={state.me}
            posts={visiblePosts}
            editable
            onChange={(me) => setState((s) => ({ ...s, me }))}
            onDeletePost={(id) => setState((s) => ({ ...s, posts: s.posts.filter((p) => p.id !== id) }))}
          />
        ) : view === 'CREATOR' ? (
          <CharacterCreator
            character={state.me.character}
            habitat={state.me.habitat}
            onChange={(character) => setState((s) => ({ ...s, me: { ...s.me, character } }))}
          />
        ) : view === 'HABITAT' ? (
          <HabitatEditor
            character={state.me.character}
            habitat={state.me.habitat}
            onChange={(habitat) => setState((s) => ({ ...s, me: { ...s.me, habitat } }))}
          />
        ) : view === 'BROADCAST' ? (
          <div className="scroll" style={{ height: '100%', paddingRight: 4 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12, alignItems: 'start' }}>
              <Composer authorId={state.me.id} onPost={addPost} />
              <Panel title="WHAT HAPPENS TO YOUR UPLOADS" riveted>
                <p style={{ fontSize: 12, lineHeight: 1.7, color: '#a8b4c0', margin: 0 }}>
                  Photos are resampled down to a period-appropriate sensor size, chroma is
                  thrown away at quarter resolution, the palette is crushed and dithered, and
                  the result is re-saved as JPEG — several times over, on the harsher presets.
                  Generation loss is doing the work, not a filter laid on top.
                </p>
                <hr className="hr" />
                <p style={{ fontSize: 12, lineHeight: 1.7, color: '#a8b4c0', margin: 0 }}>
                  Videos go through a composite/VHS signal chain adapted from{' '}
                  <a href="https://github.com/ntsc-rs/ntsc-rs" target="_blank" rel="noreferrer" className="glow-cy">
                    ntsc-rs
                  </a>
                  : the picture is encoded to YIQ, chroma is band-limited to roughly 320&nbsp;kHz
                  against luma&apos;s 2.4&nbsp;MHz, and then dot crawl, head-switching tears, edge
                  wave, dropped chroma lines and tape smear are applied in the same order that
                  project applies them.
                </p>
                <hr className="hr" />
                <p className="dim" style={{ fontSize: 11, margin: 0 }}>
                  Everything stays on this device. Media lives in IndexedDB, profile text in
                  localStorage. Nothing is uploaded anywhere.
                </p>
              </Panel>
            </div>
          </div>
        ) : (
          <Feed
            profiles={state.others}
            posts={state.posts}
            onOpen={(id) => { setVisiting(id); previewPlayer.stop(); }}
          />
        )}
      </div>
    </div>
  );
}
