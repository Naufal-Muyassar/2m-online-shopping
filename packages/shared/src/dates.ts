// Day grouping for lists in the viewer's local time: orders, deliveries.

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

// "Hari ini", "Kemarin", then "Jumat, 14 November" this year or "Jumat, 14 November 2025" before it.
export function dayHeading(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (dayKey(d) === dayKey(now)) return "Hari ini";
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dayKey(d) === dayKey(yesterday)) return "Kemarin";
  return d.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

// Keeps the incoming order (newest first, say) and splits it wherever the day changes.
export function groupByDay<T>(items: readonly T[], dateOf: (item: T) => string): { key: string; heading: string; items: T[] }[] {
  const now = new Date();
  const groups: { key: string; heading: string; items: T[] }[] = [];
  for (const item of items) {
    const iso = dateOf(item);
    const key = dayKey(new Date(iso));
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, heading: dayHeading(iso, now), items: [item] });
  }
  return groups;
}
