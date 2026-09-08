/** Core domain types. The whole app is local-first: everything here is
 *  serialisable so it can be swapped onto a real backend later. */

/** A blob stored in IndexedDB, referenced everywhere else by id. */
export type AssetId = string;

export interface Asset {
  id: AssetId;
  kind: 'image' | 'audio' | 'video';
  mime: string;
  blob: Blob;
  /** Original filename, for display. */
  name: string;
  createdAt: number;
}

/* ------------------------------------------------------------------ avatar */

export interface CharacterConfig {
  /* body */
  skinTone: string;
  build: number;        // 0..1 slim -> heavy
  height: number;       // 0..1
  /* head */
  faceId: number;
  browHeight: number;   // 0..1
  eyeSpacing: number;   // 0..1
  jaw: number;          // 0..1
  /* hair */
  hairId: number;
  hairColor: string;
  /* clothing */
  topId: number;
  topColor: string;
  topTextureAsset: AssetId | null;
  bottomId: number;
  bottomColor: string;
  bottomTextureAsset: AssetId | null;
  /* accessories */
  accessoryId: number;
  accessoryColor: string;
  /* render */
  vertexJitter: number;   // PS1 vertex snapping strength
  colorDepth: number;     // bits per channel, 2..8
  dither: number;         // 0..1
  turntable: boolean;
}

export interface HabitatConfig {
  presetId: number;
  /** User-uploaded backdrop; overrides the preset when set. */
  backdropAsset: AssetId | null;
  fogColor: string;
  fogDensity: number;   // 0..1
  lightColor: string;
  lightIntensity: number;
  label: string;        // "SECTOR 7 / SUBLEVEL 3"
}

/* ------------------------------------------------------------------- music */

export interface Track {
  /** Provider id, or a local uuid for user uploads. */
  id: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  /** 30s preview stream (iTunes) — null when unavailable. */
  previewUrl: string | null;
  source: 'itunes' | 'upload';
  /** Set for source==='upload'. */
  audioAsset?: AssetId;
}

/* -------------------------------------------------------------------- posts */

export interface Post {
  id: string;
  authorId: string;
  createdAt: number;
  caption: string;
  kind: 'photo' | 'video' | 'text';
  /** Degraded/processed media actually shown in the feed. */
  mediaAsset: AssetId | null;
  /** Untouched original, kept so settings can be re-applied. */
  originalAsset: AssetId | null;
  width?: number;
  height?: number;
}

/* ----------------------------------------------------------------- profile */

export interface Profile {
  id: string;
  handle: string;
  displayName: string;
  age: string;
  location: string;
  status: string;      // one-line "mood" — the away-message slot
  bio: string;
  hobbies: string[];
  avatarAsset: AssetId | null;
  character: CharacterConfig;
  habitat: HabitatConfig;
  favouriteTracks: (Track | null)[];  // always length 3
  ownTracks: Track[];
  createdAt: number;
}

export interface AppState {
  me: Profile;
  others: Profile[];
  posts: Post[];
}
