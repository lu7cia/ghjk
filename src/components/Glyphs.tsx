import { useMemo } from 'react';

/**
 * The unreadable script used as surface texture on the cover art the visual
 * language is borrowed from. Generated rather than typed so it never reads as
 * a real alphabet.
 */
const MARKS = '⌐¬⌠⌡≡±∙√ⁿ²ΓπΣσµτΦΘΩδ∞φε∩⎕⏃⏄⏅⌁⌂⌘⍚⍜⍾⎔◫◱◧▤▥╪╫┼╬≠≈∴∵⋔⋕';

export function Glyphs({ rows = 6, cols = 60, seed = 1 }: { rows?: number; cols?: number; seed?: number }) {
  const text = useMemo(() => {
    // Deterministic per seed, so it does not reshuffle on every render.
    let s = seed * 9301 + 49297;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () =>
        rnd() > 0.12 ? MARKS[Math.floor(rnd() * MARKS.length)] : ' ',
      ).join(''),
    ).join('\n');
  }, [rows, cols, seed]);

  return <pre className="glyphs" aria-hidden="true" style={{ margin: 0 }}>{text}</pre>;
}
