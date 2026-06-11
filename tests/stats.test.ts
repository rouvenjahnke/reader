import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { computeReadingStats } from '@/lib/stats';
import type { ArticleSummary, ReaderStatus } from '@/types/article';

function rated(id: string, status: Exclude<ReaderStatus, 'unrated'>, ratedAt: string): ArticleSummary {
  return {
    id,
    path: `/pipeline/${id}.md`,
    frontmatter: { title: id, source: 'galois', reader_status: status, reader_rated_at: ratedAt }
  };
}

describe('computeReadingStats activity & streaks', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-11T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds a full-week activity window ending today', () => {
    const stats = computeReadingStats([rated('a', 'relevant', '2026-06-11T09:00:00')]);
    expect(stats.activity).toHaveLength(119);
    expect(stats.activity[stats.activity.length - 1]).toEqual({ date: '2026-06-11', count: 1 });
    expect(stats.activity[0].count).toBe(0);
  });

  it('counts multiple ratings on the same day', () => {
    const stats = computeReadingStats([
      rated('a', 'relevant', '2026-06-10T09:00:00'),
      rated('b', 'irrelevant', '2026-06-10T10:00:00'),
      rated('c', 'high_relevant', '2026-06-10T11:00:00')
    ]);
    const day = stats.activity.find((entry) => entry.date === '2026-06-10');
    expect(day?.count).toBe(3);
  });

  it('computes the current streak ending today', () => {
    const stats = computeReadingStats([
      rated('a', 'relevant', '2026-06-09T09:00:00'),
      rated('b', 'relevant', '2026-06-10T09:00:00'),
      rated('c', 'relevant', '2026-06-11T09:00:00')
    ]);
    expect(stats.currentStreak).toBe(3);
  });

  it('keeps the streak alive when today has no rating yet', () => {
    const stats = computeReadingStats([
      rated('a', 'relevant', '2026-06-09T09:00:00'),
      rated('b', 'relevant', '2026-06-10T09:00:00')
    ]);
    expect(stats.currentStreak).toBe(2);
  });

  it('reports 0 current streak after a gap', () => {
    const stats = computeReadingStats([rated('a', 'relevant', '2026-06-08T09:00:00')]);
    expect(stats.currentStreak).toBe(0);
  });

  it('finds the longest streak across history', () => {
    const stats = computeReadingStats([
      rated('a', 'relevant', '2026-05-01T09:00:00'),
      rated('b', 'relevant', '2026-05-02T09:00:00'),
      rated('c', 'relevant', '2026-05-03T09:00:00'),
      rated('d', 'relevant', '2026-05-04T09:00:00'),
      rated('e', 'relevant', '2026-06-10T09:00:00')
    ]);
    expect(stats.longestStreak).toBe(4);
    expect(stats.currentStreak).toBe(1);
  });

  it('returns empty activity stats for no articles', () => {
    const stats = computeReadingStats([]);
    expect(stats.currentStreak).toBe(0);
    expect(stats.longestStreak).toBe(0);
    expect(stats.activity.every((entry) => entry.count === 0)).toBe(true);
  });
});
