'use client';

import { BarChart3, Keyboard, Link2, Monitor, Moon, RefreshCw, RotateCcw, Sun, Trash2 } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { flushPendingQueues } from '@/lib/cache';
import { computeReadingStats, type ActivityDay } from '@/lib/stats';
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
  { keys: 'Ctrl K', label: 'Command palette' },
  { keys: '/', label: 'Focus search (list)' },
  { keys: 't', label: 'Triage mode (list)' },
  { keys: 'b', label: 'Library (list)' },
  { keys: '←  →', label: 'Previous / next article' },
  { keys: '1 · 2 · 3', label: 'Rate irrelevant / relevant / high' },
  { keys: 'c', label: 'Table of contents (reader)' },
  { keys: 'n', label: 'Focus note (reader)' },
  { keys: 'o', label: 'Open original source (reader)' },
  { keys: '?', label: 'Toggle shortcuts overlay' },
  { keys: 'Esc', label: 'Back / close overlay' }
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
    <main className="mx-auto flex min-h-screen max-w-[720px] flex-col gap-8 px-4 py-8 text-ink">
      <div>
        <h1 className="font-heading text-2xl font-bold">Settings</h1>
        <p className="mt-2 text-sm text-mutedink">
          Local preferences are saved on this device. Nextcloud credentials stay server-side in <code className="font-meta text-xs">.env</code>.
        </p>
      </div>

      <section className="grid gap-3">
        <h2 className="theorem-label text-mutedink">Reading</h2>

        <ToggleRow
          label="Pin priority on top"
          description="Articles with reader_priority / reader_pinned in their frontmatter sort to the top, regardless of source."
          checked={prefs.pinPriorityOnTop}
          onChange={(value) => prefs.setPreference('pinPriorityOnTop', value)}
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
        <h2 className="theorem-label text-mutedink">Sync &amp; offline</h2>

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
          <span className="text-xs text-mutedink">Minimum 5 minutes. Applies to background polling on the home page.</span>
        </label>
      </section>

      <section className="grid gap-3">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-mutedink" />
          <h2 className="theorem-label text-mutedink">Obsidian</h2>
        </div>
        <label className="grid gap-2 text-sm font-medium">
          Vault name
          <Input
            value={prefs.obsidianVault}
            placeholder="e.g. obsidian - mathematics"
            onChange={(event) => prefs.setPreference('obsidianVault', event.target.value)}
          />
          <span className="text-xs text-mutedink">Leave empty to hide the »Open in Obsidian« button in the reader.</span>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Pipeline folder (relative to vault root)
          <Input
            value={prefs.obsidianPipelinePath}
            placeholder="e.g. 00_inbox/reader-pipeline"
            onChange={(event) => prefs.setPreference('obsidianPipelinePath', event.target.value)}
          />
          <span className="text-xs text-mutedink">
            The folder inside the vault that mirrors the Nextcloud pipeline directory. Deep links open the article&apos;s markdown file directly.
          </span>
        </label>
      </section>

      <section className="grid gap-3">
        <h2 className="theorem-label text-mutedink">Defaults</h2>

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
          <span className="text-xs text-mutedink">Empty = falls back to »Unrated«. Saved here, applied to the filter bar manually.</span>
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-mutedink" />
          <h2 className="theorem-label text-mutedink">Reading stats</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Rated today" value={stats.ratedToday} />
          <StatCard label="Rated 7d" value={stats.ratedThisWeek} />
          <StatCard label="Streak" value={stats.currentStreak} suffix="d" />
          <StatCard label="Total rated" value={stats.totalRated} />
        </div>

        <div className="grid gap-2 rounded-sm border border-hairline bg-surface p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-meta text-[11px] uppercase tracking-[0.08em] text-mutedink">Rating activity · last {stats.activity.length} days</span>
            <span className="font-meta text-[11px] tabular-nums text-mutedink">longest streak {stats.longestStreak}d</span>
          </div>
          <Heatmap activity={stats.activity} />
        </div>

        <div className="grid gap-2 rounded-sm border border-hairline bg-surface p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge>relevant · {stats.byStatus.relevant}</Badge>
            <Badge>high · {stats.byStatus.high_relevant}</Badge>
            <Badge>irrelevant · {stats.byStatus.irrelevant}</Badge>
            <Badge>new today · {stats.newToday}</Badge>
          </div>
          {stats.bySource.length > 0 ? (
            <div className="grid gap-1.5 text-xs text-ink">
              {stats.bySource.map((entry) => (
                <SourceBar key={entry.source} source={entry.source} count={entry.count} total={stats.totalRated} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-mutedink">No ratings yet.</p>
          )}
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex items-center gap-2">
          <Keyboard className="h-4 w-4 text-mutedink" />
          <h2 className="theorem-label text-mutedink">Keyboard shortcuts</h2>
        </div>
        <ul className="grid gap-2 rounded-sm border border-hairline bg-surface p-3 text-sm">
          {shortcutRows.map((row) => (
            <li key={row.keys} className="flex items-center justify-between gap-3">
              <span className="text-ink">{row.label}</span>
              <kbd className="rounded-sm border border-hairline bg-surface-muted px-2 py-0.5 font-meta text-xs text-ink">{row.keys}</kbd>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-3">
        <h2 className="theorem-label text-mutedink">Theme</h2>
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
        <h2 className="theorem-label text-mutedink">Connection</h2>
        <div className="flex items-center gap-3">
          <Button type="button" onClick={testConnection}>
            Test Nextcloud connection
          </Button>
          {message ? <p className="text-sm text-mutedink">{message}</p> : null}
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="theorem-label text-mutedink">Sync log</h2>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={syncNow}>
              <RefreshCw className="h-4 w-4" /> Sync
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={clearLogs}>
              <Trash2 className="h-4 w-4" /> Clear
            </Button>
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto rounded-sm border border-hairline bg-surface text-ink">
          {syncLog.length === 0 ? <p className="px-3 py-8 text-center text-sm text-mutedink">No sync entries yet.</p> : null}
          {syncLog.map((entry) => (
            <div key={entry.id} className="border-b border-hairline px-3 py-2 last:border-b-0">
              <p className={entry.level === 'error' ? 'text-sm text-[#8c1d18] dark:text-[#f2b8b5]' : 'text-sm text-ink'}>{entry.message}</p>
              <p className="mt-1 font-meta text-xs text-mutedink">{new Date(entry.createdAt).toLocaleString('en-US')}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="theorem-label text-mutedink">Reset</h2>
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
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-sm border border-hairline bg-surface px-4 py-3">
      <span className="flex flex-col gap-1">
        <span className="text-sm font-medium">{label}</span>
        {description ? <span className="text-xs text-mutedink">{description}</span> : null}
      </span>
      <input
        type="checkbox"
        className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-[var(--accent)]"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function StatCard({ label, value, suffix }: { label: string; value: number; suffix?: string }): React.ReactElement {
  return (
    <div className="rounded-sm border border-hairline bg-surface p-3">
      <div className="font-heading text-2xl font-bold tabular-nums">
        {value}
        {suffix ? <span className="text-sm text-mutedink"> {suffix}</span> : null}
      </div>
      <div className="font-meta text-[11px] uppercase tracking-[0.08em] text-mutedink">{label}</div>
    </div>
  );
}

function activityLevel(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

function Heatmap({ activity }: { activity: ActivityDay[] }): React.ReactElement {
  // Column-major grid: each column is 7 consecutive days, oldest column first.
  const columns: ActivityDay[][] = [];
  for (let i = 0; i < activity.length; i += 7) {
    columns.push(activity.slice(i, i + 7));
  }

  return (
    <div className="flex gap-[3px] overflow-x-auto pb-1">
      {columns.map((column) => (
        <div key={column[0]?.date} className="flex flex-col gap-[3px]">
          {column.map((day) => (
            <div
              key={day.date}
              className="heatmap-cell"
              data-level={activityLevel(day.count)}
              title={`${day.date}: ${day.count} rated`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function SourceBar({ source, count, total }: { source: string; count: number; total: number }): React.ReactElement {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate">{source}</span>
        <span className="shrink-0 font-meta tabular-nums text-mutedink">
          {count} · {pct}%
        </span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-muted">
        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
