import { CharacterCanvas } from '../character/CharacterCanvas';
import { Panel } from './ui';
import { useAssetImage } from '../lib/hooks';
import type { Post, Profile } from '../lib/types';

function FeedCard({ profile, postCount, onOpen }: { profile: Profile; postCount: number; onOpen: () => void }) {
  const backdrop = useAssetImage(profile.habitat.backdropAsset);
  const topImage = useAssetImage(profile.character.topTextureAsset);
  const bottomImage = useAssetImage(profile.character.bottomTextureAsset);

  return (
    <Panel
      title={`@${profile.handle}`}
      riveted
      bodyStyle={{ padding: 6 }}
      right={<span className="dim" style={{ fontSize: 10 }}>{postCount} POSTS</span>}
    >
      <div className="crt" style={{ aspectRatio: '4/3', position: 'relative', marginBottom: 7 }}>
        {/* Feed avatars render at half the profile resolution: four live WebGL
            contexts on one page is already pushing it. */}
        <CharacterCanvas
          character={profile.character}
          habitat={profile.habitat}
          backdropImage={backdrop}
          topImage={topImage}
          bottomImage={bottomImage}
          internalWidth={160}
          internalHeight={120}
          interactive={false}
        />
        <div className="noise-veil" />
        <div
          className="glow"
          style={{ position: 'absolute', left: 6, bottom: 4, zIndex: 7, fontSize: 9, letterSpacing: '.12em', pointerEvents: 'none' }}
        >
          {profile.habitat.label}
        </div>
      </div>

      <div className="chroma" style={{ fontSize: 19, lineHeight: 1 }}>{profile.displayName}</div>
      <div className="glow-am" style={{ fontSize: 11, fontStyle: 'italic', marginTop: 2, minHeight: 28 }}>
        {profile.status}
      </div>

      <div style={{ margin: '6px 0 8px' }}>
        {profile.hobbies.slice(0, 3).map((h) => (
          <span key={h} className="tag" style={{ fontSize: 12 }}>{h}</span>
        ))}
      </div>

      <button className="btn btn--sm btn--primary" style={{ width: '100%' }} onClick={onOpen}>
        VIEW PAGE
      </button>
    </Panel>
  );
}

export function Feed({
  profiles, posts, onOpen,
}: {
  profiles: Profile[];
  posts: Post[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="scroll" style={{ height: '100%', paddingRight: 4 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 12 }}>
        {profiles.map((p) => (
          <FeedCard
            key={p.id}
            profile={p}
            postCount={posts.filter((x) => x.authorId === p.id).length}
            onOpen={() => onOpen(p.id)}
          />
        ))}
      </div>
    </div>
  );
}
