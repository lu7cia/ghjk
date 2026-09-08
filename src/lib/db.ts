/** Local-first persistence.
 *
 *  Profiles/posts (small, JSON) live in localStorage; media blobs live in
 *  IndexedDB so we are not fighting the ~5MB string quota. Everything goes
 *  through this module so swapping in a real API later is a single-file job.
 */

import type { Asset, AssetId, AppState } from './types';

const DB_NAME = 'ghjk';
const DB_VERSION = 1;
const STORE = 'assets';
const STATE_KEY = 'ghjk.state.v1';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export function uid(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/* ------------------------------------------------------------------ assets */

export async function putAsset(
  blob: Blob,
  kind: Asset['kind'],
  name = 'untitled',
): Promise<AssetId> {
  const asset: Asset = {
    id: uid('a_'),
    kind,
    mime: blob.type || 'application/octet-stream',
    blob,
    name,
    createdAt: Date.now(),
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(asset);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return asset.id;
}

export async function getAsset(id: AssetId): Promise<Asset | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as Asset) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteAsset(id: AssetId): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* Object URLs are cached per asset so re-rendering does not leak a new URL
 * on every paint. Revoked wholesale on unload. */
const urlCache = new Map<AssetId, string>();

export async function assetUrl(id: AssetId | null | undefined): Promise<string | null> {
  if (!id) return null;
  const cached = urlCache.get(id);
  if (cached) return cached;
  const asset = await getAsset(id);
  if (!asset) return null;
  const url = URL.createObjectURL(asset.blob);
  urlCache.set(id, url);
  return url;
}

export function forgetAssetUrl(id: AssetId): void {
  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    urlCache.forEach((url) => URL.revokeObjectURL(url));
  });
}

/* ------------------------------------------------------------------- state */

export function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as AppState) : null;
  } catch {
    return null;
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch (err) {
    // Quota blown, or private mode. Non-fatal: the session still works, it
    // just will not survive a reload.
    console.warn('[ghjk] could not persist state', err);
  }
}

export function wipeState(): void {
  localStorage.removeItem(STATE_KEY);
  indexedDB.deleteDatabase(DB_NAME);
}
