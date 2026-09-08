import { useState } from 'react';
import { CharacterCanvas } from '../character/CharacterCanvas';
import { Panel, FileButton, Readout } from './ui';
import { MusicDeck } from './MusicDeck';
import { PostCard } from './PostCard';
import { useAssetImage, useAssetUrl } from '../lib/hooks';
import { putAsset } from '../lib/db';
import { degradeImage, DEGRADE_PRESETS } from '../lib/degrade';
import type { Post, Profile, Track } from '../lib/types';

interface Props {
  profile: Profile;
  posts: Post[];
  editable: boolean;
  onChange?: (p: Profile) => void;
  onDeletePost?: (id: string) => void;
}

export function ProfileView({ profile, posts, editable, onChange, onDeletePost }: Props) {
  const [editing, setEditing] = useState(false);
  const backdrop = useAssetImage(profile.habitat.backdropAsset);
  const topImage = useAssetImage(profile.character.topTextureAsset);
  const bottomImage = useAssetImage(profile.character.bottomTextureAsset);
  const avatarUrl = useAssetUrl(profile.avatarAsset);

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    onChange?.({ ...profile, [key]: value });

  const uploadAvatar = async (file: File) => {
    const preset = DEGRADE_PRESETS.find((p) => p.name === 'WEBCAM 1999')!;
    const { blob } = await degradeImage(file, { ...preset, maxEdge: 160 });
    const id = await putAsset(blob, 'image', file.name);
    set('avatarAsset', id);
  };

  const joined = new Date(profile.createdAt).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  return (
    <div className="scroll" style={{ height: '100%', paddingRight: 4 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) minmax(0,1fr)', gap: 12 }}>

        {/* -------------------------------------------------------- left rail */}
        <div className="stack">
          <Panel title="HABITAT" bodyStyle={{ padding: 6 }}>
            <div className="crt" style={{ aspectRatio: '4/3', position: 'relative' }}>
              <CharacterCanvas
                character={profile.character}
                habitat={profile.habitat}
                backdropImage={backdrop}
                topImage={topImage}
                bottomImage={bottomImage}
                internalWidth={320}
                internalHeight={240}
              />
              <div className="noise-veil" />
              <div
                className="glow"
                style={{ position: 'absolute', left: 7, bottom: 5, zIndex: 7, fontSize: 10, letterSpacing: '.14em', pointerEvents: 'none' }}
              >
                {profile.habitat.label}
              </div>
            </div>
          </Panel>

          <Panel title="IDENT" riveted>
            <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <div
                className="center"
                style={{
                  width: 76, height: 76, flexShrink: 0,
                  background: '#02040a', border: '1px solid #263042',
                  boxShadow: 'var(--bevel-in)', overflow: 'hidden',
                }}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', imageRendering: 'pixelated' }}
                  />
                ) : (
                  <span className="dim" style={{ fontSize: 10, textAlign: 'center' }}>NO<br />PHOTO</span>
                )}
              </div>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="chroma" style={{ fontSize: 24, lineHeight: 1 }}>{profile.displayName || 'UNNAMED'}</div>
                <div className="glow-cy" style={{ fontSize: 12 }}>@{profile.handle}</div>
                {editable && (
                  <FileButton accept="image/*" className="btn btn--sm" onFile={(f) => uploadAvatar(f[0])}>
                    {profile.avatarAsset ? 'CHANGE' : 'ADD PHOTO'}
                  </FileButton>
                )}
              </div>
            </div>

            <hr className="hr" />
            <Readout label="AGE" value={profile.age || '—'} />
            <Readout label="LOCATION" value={profile.location || '—'} accent="mg" />
            <Readout label="JOINED" value={joined} accent="am" />
            <Readout label="POSTS" value={String(posts.length)} />
          </Panel>

          <Panel title="STATUS" riveted>
            {editing ? (
              <input
                type="text"
                value={profile.status}
                maxLength={90}
                onChange={(e) => set('status', e.target.value)}
                placeholder="away message"
              />
            ) : (
              <div className="glow-am" style={{ fontSize: 13, fontStyle: 'italic' }}>
                {profile.status || '—'}
              </div>
            )}
          </Panel>
        </div>

        {/* ------------------------------------------------------ right column */}
        <div className="stack">
          {editable && (
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className={`btn btn--sm ${editing ? 'btn--primary' : ''}`} onClick={() => setEditing(!editing)}>
                {editing ? 'DONE EDITING' : 'EDIT PROFILE'}
              </button>
            </div>
          )}

          {editing ? (
            <Panel title="EDIT DETAILS" riveted>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div className="field">
                  <label>Name</label>
                  <input type="text" value={profile.displayName} maxLength={24} onChange={(e) => set('displayName', e.target.value)} />
                </div>
                <div className="field">
                  <label>Handle</label>
                  <input
                    type="text"
                    value={profile.handle}
                    maxLength={24}
                    onChange={(e) => set('handle', e.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase())}
                  />
                </div>
                <div className="field">
                  <label>Age</label>
                  <input type="text" value={profile.age} maxLength={6} onChange={(e) => set('age', e.target.value)} />
                </div>
                <div className="field">
                  <label>Location</label>
                  <input type="text" value={profile.location} maxLength={40} onChange={(e) => set('location', e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label>Bio</label>
                <textarea value={profile.bio} maxLength={600} onChange={(e) => set('bio', e.target.value)} />
              </div>
              <div className="field">
                <label>Hobbies (comma separated)</label>
                <input
                  type="text"
                  value={profile.hobbies.join(', ')}
                  onChange={(e) =>
                    set('hobbies', e.target.value.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 12))
                  }
                />
              </div>
            </Panel>
          ) : (
            <Panel title="ABOUT" riveted>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: '#c0cad4', whiteSpace: 'pre-wrap' }}>
                {profile.bio || <span className="dim">Nothing written yet.</span>}
              </p>
              {profile.hobbies.length > 0 && (
                <>
                  <hr className="hr" />
                  <div>{profile.hobbies.map((h) => <span key={h} className="tag">{h}</span>)}</div>
                </>
              )}
            </Panel>
          )}

          <MusicDeck
            favourites={profile.favouriteTracks}
            ownTracks={profile.ownTracks}
            editable={editable && editing}
            onFavourites={(t: (Track | null)[]) => set('favouriteTracks', t)}
            onOwnTracks={(t: Track[]) => set('ownTracks', t)}
          />

          <Panel title={`POSTS / ${posts.length}`} riveted>
            {posts.length === 0 ? (
              <p className="dim" style={{ fontSize: 12, margin: 0 }}>
                {editable ? 'Nothing posted yet. Head to BROADCAST.' : 'This user has not posted.'}
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: 10 }}>
                {posts.map((p) => (
                  <PostCard key={p.id} post={p} onDelete={editable ? onDeletePost : undefined} />
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
