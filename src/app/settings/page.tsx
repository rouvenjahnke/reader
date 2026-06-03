'use client';

import { BarChart3, Keyboard, Monitor, Moon, RefreshCw, RotateCcw, Sun, Trash2 } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { flushPendingQueues } from '@/lib/cache';
import { computeReadingStats } from '@/lib/stats';
import { loadCachedSummaries } from '@/lib/sync';
import { clearSyncLog, readSyncLog, type SyncLogEntry } from '@/lib/syncLog';
import { defaultPreferences, type FontSize, usePreferencesStore } from '@/stores/usePreferencesStore';
import type { ArticleSortMode, ArticleSummary, ReaderStatus } from '@/types/article';

const fontSizes: FontSize[] = ['S', 'M', 'L', 'XL'];
const sortModes: Array<{ value: ArticleSortMode; label: string }> = [
  { value: 'newest', label: 'Newest' },
  { value: 'score', label: 'Score' }
];
const statusOptions: Array<{ value: ReaderStatus; label: string }> = [
  { value: 'unrated', label: 'Unrated' },
  { value: 'relevant', label: 'Relevant' },
  { value: 'high_relevant', label: 'High' },
  { value: 'irrelevant', label: 'Irrelevant' }
];

const shortcutRows: Array<{ keys: string; label: string }> = [
  { keys: '←  →', label: 'Previous / next article' },
  { keys: '1', label: 'Rate irrelevant' },
  { keys: '2', label: 'Rate relevant' },
  { keys: '3', label: 'Rate high relevant' },
  { keys: 'Esc', label: 'Back to list' },
  { keys: '?', label: 'Toggle shortcuts overlay' }
];

export default function SettingsPage(): React.ReactElement {
  const { setTheme, theme } = useTheme();
  const prefs = usePreferencesStore();
  const [message, setMessage] = useState('');
  const [syncLog, setSyncLog] = useState<SyncLogEntry[]>([]);
  const [summaries, setSummaries] = useState<ArticleSummary[]>([]);

  useEffect(() => {
    setSyncLog(readSyncLog());
    void loadCachedSummaries().then(setSummaries);
  }, []);

  const stats = useMemo(() => computeReadingStats(summaries), [summaries]);

  const testConnection = async () => {
    setMessage('Testing connection…');
    const response = await fetch('/api/settings/test', { method: 'POST' });
    if (response.ok) {
      const result = (await response.json()) as { count: number };
      setMessage(`Connection ok, ${result.count} markdown files found.`);
    } else {
      setMessage(`Error: ${await response.text()}`);
    }
  };

  const syncNow = async () => {
    setMessage('Flushing pending queue…');
    await flushPendingQueues();
    setSyncLog(readSyncLog());
    setMessage('Sync run finished.');
  };

  const clearLogs = () => {
    clearSyncLog();
    setSyncLog([]);
  };

  const toggleDefaultStatus = (status: ReaderStatus) => {
    const exists = prefs.defaultStatuses.includes(status);
    const next = exists ? prefs.defaultStatuses.filter((item) => item !== status) : [...prefs.defaultStatuses, status];
    prefs.setPreference('defaultStatuses', next.length > 0 ? next : ['unrated']);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-[720px] flex-col gap-8 px-4 py-8 text-neutral-950 dark:text-neutral-50">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-400">
          Local preferences are saved on this device. Nextcloud credentials stay server-side in <code>.env</code>.
        </p>
      </div>

      <section className="grid gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700 dark:text-neutral-400">Reading</h2>

        <ToggleRow
          label="Pin Galois on top"
          description="Priority (reader_priority / reader_pinned) is honoured only for source = galois. Other sources sort normally."
          checked={prefs.pinGaloisOnTop}
          onChange={(value) => prefs.setPreference('pinGaloisOnTop', value)}
        />

        <ToggleRow
          label="Show »Continue reading«"
          description="Surfaces the last opened article at the top of the list."
          checked={prefs.showContinueReading}
          onChange={(value) => prefs.setPreference('showContinueReading', value)}
        />

        <ToggleRow
          label="Reading progress bar"
          description="Thin scroll-position bar at the top of the reader."
          checked={prefs.showReadingProgress}
          onChange={(value) => prefs.setPreference('showReadingProgress', value)}
        />

        <div className="grid gap-2">
          <span className="text-sm font-medium">Reading font size</span>
          <div className="flex gap-2">
            {fontSizes.map((size) => (
              <Button
                key={size}
                type="button"
                variant={prefs.fontSize === size ? 'default' : 'secondary'}
                onClick={() => prefs.setPreference('fontSize', size)}
              >
                {size}
              </Button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700 dark:text-neutral-400">Sync &amp; offline</h2>

        <ToggleRow
          label="Auto-sync on app open"
          description="Disable to skip the background fetch when launching. Manual sync stays available via the refresh button."
          checked={prefs.autoSyncOnOpen}
          onChange={(value) => prefs.setPreference('autoSyncOnOpen', value)}
        />

        <ToggleRow
          label="Prefetch article bodies"
          description="After each sync, fetch the body of every changed article in the background so you can read and rate them offline."
          checked={prefs.bodyPrefetch}
          onChange={(value) => prefs.setPreference('bodyPrefetch', value)}
        />

        <label className="grid gap-2 text-sm font-medium">
          Background sync interval (minutes)
          <Input
            type="number"
            min={5}
            value={String(prefs.syncIntervalMinutes)}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              if (Number.isFinite(parsed) && parsed >= 5) {
                prefs.setPreference('syncIntervalMinutes', Math.round(parsed));
              }
            }}
          />
          <span className="text-xs text-neutral-600 dark:text-neutral-400">Minimum 5 minutes. Applies to background polling on the home page.</span>
        </label>
      </section>

      <section className="grid gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700 dark:text-neutral-400">Defaults</h2>

        <div className="grid gap-2">
          <span className="text-sm font-medium">Default sort mode</span>
          <div className="flex gap-2">
            {sortModes.map((mode) => (
              <Button
                key={mode.value}
                type="button"
                variant={prefs.defaultSortMode === mode.value ? 'default' : 'secondary'}
                onClick={() => prefs.setPreference('defaultSortMode', mode.value)}
              >
                {mode.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-2">
          <span className="text-sm font-medium">Default visible statuses</span>
          <div className="flex flex-wrap gap-2">
            {statusOptions.map((status) => (
              <Button
                key={status.value}
                type="button"
                size="sm"
                variant={prefs.defaultStatuses.includes(status.value) ? 'default' : 'secondary'}
                onClick={() => toggleDefaultStatus(status.value)}
              >
                {status.label}
              </Button>
            ))}
          </div>
          <span className="text-xs text-neutral-600 dark:text-neutral-400">Empty = falls back to »Unrated«. Saved here, applied to the filter bar manually.</span>
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700 dark:text-neutral-400">Reading stats</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Rated today" value={stats.ratedToday} />
          <StatCard label="Rated 7d" value={stats.ratedThisWeek} />
          <StatCard label="New today" value={stats.newToday} />
          <StatCard label="Total rated" value={stats.totalRated} />
        </div>
        <div className="grid gap-2 rounded-md border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
              relevant · {stats.byStatus.relevant}
            </Badge>
            <Badge className="border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-200">
              high · {stats.byStatus.high_relevant}
            </Badge>
            <Badge className="border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              irrelevant · {stats.byStatus.irrelevant}
            </Badge>
          </div>
          {stats.bySource.length > 0 ? (
            <div className="grid gap-1.5 text-xs text-neutral-700 dark:text-neutral-300">
              {stats.bySource.map((entry) => (
                <SourceBar key={entry.source} source={entry.source} count={entry.count} total={stats.totalRated} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-neutral-600 dark:text-neutral-400">No ratings yet.</p>
          )}
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex items-center gap-2">
          <Keyboard className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700 dark:text-neutral-400">Keyboard shortcuts</h2>
        </div>
        <ul className="grid gap-2 rounded-md border border-neutral-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-950">
          {shortcutRows.map((row) => (
            <li key={row.keys} className="flex items-center justify-between gap-3">
              <span className="text-neutral-700 dark:text-neutral-300">{row.label}</span>
              <kbd className="rounded border border-neutral-300 bg-neutral-100 px-2 py-0.5 font-mono text-xs text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                {row.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700 dark:text-neutral-400">Theme</h2>
        <div className="flex gap-2">
          <Button type="button" variant={theme === 'light' ? 'default' : 'secondary'} onClick={() => setTheme('light')}>
            <Sun className="h-4 w-4" /> Light
          </Button>
          <Button type="button" variant={theme === 'dark' ? 'default' : 'secondary'} onClick={() => setTheme('dark')}>
            <Moon className="h-4 w-4" /> Dark
          </Button>
          <Button type="button" variant={theme === 'system' ? 'default' : 'secondary'} onClick={() => setTheme('system')}>
            <Monitor className="h-4 w-4" /> System
          </Button>
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700 dark:text-neutral-400">Connection</h2>
        <div className="flex items-center gap-3">
          <Button type="button" onClick={testConnection}>
            Test Nextcloud connection
          </Button>
          {message ? <p className="text-sm text-neutral-700 dark:text-neutral-400">{message}</p> : null}
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700 dark:text-neutral-400">Sync log</h2>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={syncNow}>
              <RefreshCw className="h-4 w-4" /> Sync
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={clearLogs}>
              <Trash2 className="h-4 w-4" /> Clear
            </Button>
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto rounded-md border border-neutral-300 bg-white text-neutral-950 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50">
          {syncLog.length === 0 ? <p className="px-3 py-8 text-center text-sm text-neutral-700 dark:text-neutral-400">No sync entries yet.</p> : null}
          {syncLog.map((entry) => (
            <div key={entry.id} className="border-b border-neutral-100 px-3 py-2 last:border-b-0 dark:border-neutral-900">
              <p className={entry.level === 'error' ? 'text-sm text-red-700 dark:text-red-300' : 'text-sm text-neutral-800 dark:text-neutral-200'}>{entry.message}</p>
              <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-500">{new Date(entry.createdAt).toLocaleString('en-US')}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700 dark:text-neutral-400">Reset</h2>
        <div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              prefs.resetPreferences();
              setMessage(`Preferences reset to defaults (${Object.keys(defaultPreferences).length} keys).`);
            }}
          >
            <RotateCcw className="h-4 w-4" /> Reset preferences
          </Button>
        </div>
      </section>
    </main>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}): React.ReactElement {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-md border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950">
      <span className="flex flex-col gap-1">
        <span className="text-sm font-medium">{label}</span>
        {description ? <span className="text-xs text-neutral-600 dark:text-neutral-400">{description}</span> : null}
      </span>
      <input
        type="checkbox"
        className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-amber-500"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function StatCard({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs uppercase tracking-wide text-neutral-600 dark:text-neutral-400">{label}</div>
    </div>
  );
}

function SourceBar({ source, count, total }: { source: string; count: number; total: number }): React.ReactElement {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate">{source}</span>
        <span className="shrink-0 tabular-nums text-neutral-600 dark:text-neutral-400">
          {count} · {pct}%
        </span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
        <div className="h-full bg-teal-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
