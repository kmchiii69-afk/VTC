const TOTAL_ROADMAP = 25;

export function computeActivityLevel(lastLoginMs: number, roadmapCompleted: number): string {
  const now = Date.now();
  const daysSince = lastLoginMs ? (now - lastLoginMs) / (1000 * 60 * 60 * 24) : 999;

  let score = 0;

  // Login recency (0–4 pts)
  if (daysSince <= 1)       score += 4;
  else if (daysSince <= 3)  score += 3;
  else if (daysSince <= 7)  score += 2;
  else if (daysSince <= 14) score += 1;

  // Roadmap progress (0–2 pts)
  const pct = roadmapCompleted / TOTAL_ROADMAP;
  if (pct >= 0.5)      score += 2;
  else if (pct >= 0.2) score += 1;

  if (score >= 5) return 'very_active';
  if (score >= 3) return 'active';
  if (score >= 2) return 'moderate';
  if (score >= 1) return 'low';
  return 'inactive';
}

export function activityLabel(level: string): string {
  const map: Record<string, string> = {
    very_active: 'Very Active', active: 'Active', moderate: 'Moderate',
    low: 'Low', inactive: 'Inactive',
  };
  return map[level] ?? '—';
}

export const ACTIVITY_COLORS: Record<string, string> = {
  very_active: '#4ade80', active: '#86efac', moderate: '#fbbf24',
  low: '#f97316', inactive: '#ef4444',
};
