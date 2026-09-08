import { useEffect, useState } from 'react';
import { assetUrl } from './db';
import type { AssetId } from './types';

/** Resolve an asset id to a decoded <img>, for use as a texture or preview. */
export function useAssetImage(id: AssetId | null | undefined): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!id) {
      setImg(null);
      return;
    }
    assetUrl(id).then((url) => {
      if (!url || cancelled) return;
      const image = new Image();
      image.onload = () => {
        if (!cancelled) setImg(image);
      };
      image.src = url;
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return img;
}

/** Resolve an asset id to an object URL. */
export function useAssetUrl(id: AssetId | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!id) {
      setUrl(null);
      return;
    }
    assetUrl(id).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);
  return url;
}
