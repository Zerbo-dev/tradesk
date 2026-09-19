/**
 * Suit le temps restant sur TOUTE une requête (pas juste un appel), pour
 * éviter que plusieurs timeouts individuels (25s + 20s + ...) cumulés sur
 * plusieurs paires ne dépassent la limite serverless (Vercel maxDuration).
 */
export function makeDeadline(totalBudgetMs: number) {
  const start = Date.now();
  return {
    remainingMs: () => Math.max(0, totalBudgetMs - (Date.now() - start)),
    expired: () => Date.now() - start >= totalBudgetMs,
  };
}

export type Deadline = ReturnType<typeof makeDeadline>;
