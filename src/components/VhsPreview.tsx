import { useEffect, useRef } from 'react';
import { NtscRenderer } from '../lib/ntsc/renderer';
import type { NtscSettings } from '../lib/ntsc/presets';

/**
 * Live pass-through of a <video> element through the NTSC pipeline.
 *
 * The element itself is never shown; it is only a frame source. What the user
 * sees is the shader output, so the preview and the exported file are produced
 * by exactly the same code path.
 */
export function VhsPreview({
  video, settings, className, style,
}: {
  video: HTMLVideoElement | null;
  settings: NtscSettings;
  className?: string;
  style?: React.CSSProperties;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !video) return;

    let renderer: NtscRenderer;
    try {
      renderer = new NtscRenderer();
    } catch (err) {
      host.innerHTML =
        '<div style="padding:12px;font-size:12px;color:#ff7a88">' +
        (err instanceof Error ? err.message : 'WebGL2 unavailable') +
        '</div>';
      return;
    }

    const canvas = renderer.canvas;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.objectFit = 'contain';
    canvas.style.imageRendering = 'pixelated';
    host.appendChild(canvas);

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const s = settingsRef.current;
      const aspect = video.videoWidth / video.videoHeight || 4 / 3;
      renderer.resizeFor(s, aspect);
      renderer.render(video, s);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
      canvas.remove();
    };
  }, [video]);

  return <div ref={hostRef} className={className} style={style} />;
}
