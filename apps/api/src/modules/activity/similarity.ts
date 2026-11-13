const normalise = (s: string) => s.replace(/\s+/g, ' ').trim();

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/**
 * Similarity of two texts in percent (0..100).
 * Exact match → 100; whitespace-only differences → 99; otherwise Sørensen–Dice on bigrams.
 */
export function similarityPercent(a: string, b: string, maxChars = 20_000): number {
  if (a === b) return 100;
  const na = normalise(a).slice(0, maxChars);
  const nb = normalise(b).slice(0, maxChars);
  if (na.length === 0 || nb.length === 0) return 0;
  if (na === nb) return 99;
  if (na.length < 2 || nb.length < 2) return 0;
  const ga = bigrams(na);
  const gb = bigrams(nb);
  let overlap = 0;
  for (const [g, n] of ga) overlap += Math.min(n, gb.get(g) ?? 0);
  const score = (2 * overlap) / (na.length - 1 + nb.length - 1);
  return Math.min(98, Math.round(score * 100));
}
