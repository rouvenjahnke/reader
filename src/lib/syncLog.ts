'use client';

export interface SyncLogEntry {
  id: string;
  level: 'info' | 'error';
  message: string;
  createdAt: string;
}

const key = 'reader-sync-log';

export function appendSyncLog(level: SyncLogEntry['level'], message: string): void {
  const entries = readSyncLog();
  const next = [
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      level,
      message,
      createdAt: new Date().toISOString()
    },
    ...entries
  ].slice(0, 80);
  window.localStorage.setItem(key, JSON.stringify(next));
}

export function readSyncLog(): SyncLogEntry[] {
  const raw = window.localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSyncLogEntry);
  } catch {
    return [];
  }
}

export function clearSyncLog(): void {
  window.localStorage.removeItem(key);
}

function isSyncLogEntry(value: unknown): value is SyncLogEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === 'string' && (entry.level === 'info' || entry.level === 'error') && typeof entry.message === 'string' && typeof entry.createdAt === 'string';
}
