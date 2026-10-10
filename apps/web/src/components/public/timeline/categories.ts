import type { TimelineCategory } from '@birthday/types';

export const CATEGORY_LABELS: Record<TimelineCategory, string> = {
  BIRTH: 'Birth',
  EDUCATION: 'Education',
  CAREER: 'Career',
  FAMILY: 'Family',
  FAITH: 'Faith',
  ACHIEVEMENT: 'Achievement',
  TRAVEL: 'Travel',
  MILESTONE: 'Milestone',
  OTHER: 'Life',
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function monthName(month: number | null): string | null {
  return month && month >= 1 && month <= 12 ? MONTHS[month - 1] : null;
}

/** Evenly spaced highlights across a life, always including the first and last entries. */
export function pickHighlights<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  const picked: T[] = [];
  for (let i = 0; i < count; i++) {
    picked.push(items[Math.round((i * (items.length - 1)) / (count - 1))]);
  }
  return picked;
}

export function sortTimeline<T extends { year: number; month: number | null; sortOrder: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.year - b.year || (a.month ?? 0) - (b.month ?? 0) || a.sortOrder - b.sortOrder);
}
