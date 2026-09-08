/**
 * Track search, backed by the iTunes Search API.
 *
 * Chosen over Spotify and friends because it needs no key, no OAuth dance and
 * no backend to hold a secret — and, critically, it still returns a real 30
 * second preview stream per track, so previews actually work. Spotify removed
 * preview URLs from its search responses, and Deezer's API will not talk to a
 * browser origin.
 *
 * Docs: https://performance-partners.apple.com/search-api
 */

import type { Track } from './types';

const ENDPOINT = 'https://itunes.apple.com/search';

interface ITunesResult {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
}

function toTrack(r: ITunesResult): Track {
  return {
    id: String(r.trackId),
    title: r.trackName,
    artist: r.artistName,
    // The artwork URL is templated by size; ask for something big enough to
    // survive being drawn at 2x on the profile.
    artworkUrl: r.artworkUrl100?.replace('100x100', '300x300') ?? null,
    previewUrl: r.previewUrl ?? null,
    source: 'itunes',
  };
}

/**
 * JSONP fallback.
 *
 * The Search API's CORS headers are inconsistent depending on region and
 * endpoint, but it has always honoured the `callback` parameter. Rather than
 * gamble on a fetch succeeding, fall back to a script tag when it does not.
 */
function jsonpSearch(term: string, limit: number): Promise<Track[]> {
  return new Promise((resolve, reject) => {
    const cbName = `__ghjk_itunes_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('search timed out'));
    }, 10_000);

    function cleanup() {
      window.clearTimeout(timeout);
      delete (window as unknown as Record<string, unknown>)[cbName];
      script.remove();
    }

    (window as unknown as Record<string, unknown>)[cbName] = (data: { results?: ITunesResult[] }) => {
      cleanup();
      resolve((data.results ?? []).filter((r) => r.trackName).map(toTrack));
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('could not reach the music database'));
    };

    const params = new URLSearchParams({
      term,
      entity: 'song',
      limit: String(limit),
      callback: cbName,
    });
    script.src = `${ENDPOINT}?${params}`;
    document.head.appendChild(script);
  });
}

export async function searchTracks(term: string, limit = 20): Promise<Track[]> {
  const query = term.trim();
  if (!query) return [];

  const params = new URLSearchParams({ term: query, entity: 'song', limit: String(limit) });
  try {
    const res = await fetch(`${ENDPOINT}?${params}`);
    if (!res.ok) throw new Error(`search failed: ${res.status}`);
    const data = (await res.json()) as { results?: ITunesResult[] };
    return (data.results ?? []).filter((r) => r.trackName).map(toTrack);
  } catch {
    return jsonpSearch(query, limit);
  }
}

/**
 * A single shared <audio> element for previews.
 *
 * Keeping one element means starting a new preview always stops the previous
 * one, with no bookkeeping at the call sites.
 */
class PreviewPlayer {
  private audio: HTMLAudioElement | null = null;
  private currentId: string | null = null;
  private listeners = new Set<(id: string | null) => void>();

  private ensure(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.volume = 0.7;
      this.audio.addEventListener('ended', () => this.setCurrent(null));
      this.audio.addEventListener('pause', () => {
        if (this.audio?.ended) this.setCurrent(null);
      });
    }
    return this.audio;
  }

  private setCurrent(id: string | null): void {
    this.currentId = id;
    this.listeners.forEach((fn) => fn(id));
  }

  subscribe(fn: (id: string | null) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get playingId(): string | null {
    return this.currentId;
  }

  async toggle(id: string, url: string): Promise<void> {
    const audio = this.ensure();
    if (this.currentId === id) {
      audio.pause();
      this.setCurrent(null);
      return;
    }
    audio.src = url;
    this.setCurrent(id);
    try {
      await audio.play();
    } catch {
      // Autoplay policy, or a dead URL. Roll the UI back rather than lying
      // about what is playing.
      this.setCurrent(null);
    }
  }

  stop(): void {
    this.audio?.pause();
    this.setCurrent(null);
  }
}

export const previewPlayer = new PreviewPlayer();
