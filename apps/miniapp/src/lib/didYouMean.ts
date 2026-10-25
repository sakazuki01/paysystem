// S4 "Did you mean": input within edit distance 1–2 of someone you've paid before.

export function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

export function didYouMean<T extends { username: string; timesPaid: number }>(input: string, past: T[]): T | null {
  const q = input.trim().replace(/^@/, "").toLowerCase();
  if (q.length < 3) return null;
  let best: T | null = null;
  let bestDist = Infinity;
  for (const p of past) {
    if (p.timesPaid === 0) continue;
    if (p.username === q) return null; // exact match: they meant this person
    if (p.username.startsWith(q)) continue; // still typing it
    const d = editDistance(q, p.username);
    if (d >= 1 && d <= 2 && (d < bestDist || (d === bestDist && p.timesPaid > (best?.timesPaid ?? 0)))) {
      best = p;
      bestDist = d;
    }
  }
  return best;
}
