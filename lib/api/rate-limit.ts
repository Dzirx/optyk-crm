// Prosty limit nieudanych prób w pamięci procesu (jedna instancja aplikacji).
// Po restarcie licznik się zeruje — to wystarcza, aby zatrzymać zgadywanie haseł.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
}

/** true, gdy klucz przekroczył limit w bieżącym oknie. */
export function isLimited(key: string, limit: number, now = Date.now()): boolean {
  const b = buckets.get(key);
  return !!b && b.resetAt > now && b.count >= limit;
}

/** Zapisuje nieudaną próbę. */
export function recordFailure(key: string, windowMs: number, now = Date.now()): void {
  sweep(now);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) buckets.set(key, { count: 1, resetAt: now + windowMs });
  else b.count++;
}

/** Usuwa licznik (np. po udanym logowaniu). */
export function clearFailures(key: string): void {
  buckets.delete(key);
}
