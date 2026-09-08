import { useAssetUrl } from '../lib/hooks';
import type { Post } from '../lib/types';

export function PostCard({ post, onDelete }: { post: Post; onDelete?: (id: string) => void }) {
  const url = useAssetUrl(post.mediaAsset);

  const when = new Date(post.createdAt).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="panel panel--sunk" style={{ padding: 6, position: 'relative' }}>
      {post.kind === 'photo' && url && (
        <div className="filmstrip" style={{ padding: 8, marginBottom: 6 }}>
          <img
            src={url}
            alt={post.caption}
            style={{ width: '100%', display: 'block', imageRendering: 'pixelated' }}
          />
        </div>
      )}

      {post.kind === 'video' && url && (
        <div className="crt" style={{ marginBottom: 6 }}>
          <video
            src={url}
            controls
            loop
            playsInline
            style={{ width: '100%', display: 'block', imageRendering: 'pixelated' }}
          />
        </div>
      )}

      {post.caption && (
        <p style={{ margin: '0 0 4px', fontSize: 12, lineHeight: 1.5, color: '#b6c4ac', whiteSpace: 'pre-wrap' }}>
          {post.caption}
        </p>
      )}

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="dim" style={{ fontSize: 10 }}>
          {when}
          {post.width ? ` · ${post.width}×${post.height}` : ''}
        </span>
        {onDelete && (
          <button className="btn btn--sm btn--danger" onClick={() => onDelete(post.id)}>✕</button>
        )}
      </div>
    </div>
  );
}
