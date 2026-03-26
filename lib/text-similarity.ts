/**
 * Lightweight overlap check for de-duplicating narratives (Prompt 48–49).
 * Shared by PDF export and dashboard research UI.
 */
export function textBodiesTooSimilar(a: string, b: string): boolean {
  const na = a
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const nb = b
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  if (na.length < 5 || nb.length < 5) {
    const short = a.length <= b.length ? a : b;
    const long = a.length <= b.length ? b : a;
    const frag = short.slice(0, 36).trim().toLowerCase();
    return frag.length >= 24 && long.toLowerCase().includes(frag);
  }
  const setA = new Set(na);
  let inter = 0;
  for (const w of nb) if (setA.has(w)) inter += 1;
  const union = new Set([...na, ...nb]).size;
  return union > 0 && inter / union > 0.42;
}

/** True if `fragment` is substantially similar to any non-empty corpus string. */
export function textEchoesAnyCorpus(fragment: string, corpus: readonly string[]): boolean {
  return corpus.some((c) => c.trim().length > 12 && textBodiesTooSimilar(fragment, c));
}
