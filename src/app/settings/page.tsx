'use client';

import { Monitor, Moon, RefreshCw, Sun, Trash2 } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { flushPendingQueues } from '@/lib/cache';
import { clearSyncLog, readSyncLog, type SyncLogEntry } from '@/lib/syncLog';

interface Settings {
  nextcloudUrl: string;
  username: string;
  basePath: string;
  syncInterval: string;
  fontSize: 'S' | 'M' | 'L';
}

const defaults: Settings = {
  nextcloudUrl: '',
  username: '',
  basePath: '/Reader-Pipeline/',
  syncInterval: '30',
  fontSize: 'M'
};

export default function SettingsPage(): React.ReactElement {
  const { setTheme, theme } = useTheme();
  const [settings, setSettings] = useState<Settings>(defaults);
  const [message, setMessage] = useState('');
  const [syncLog, setSyncLog] = useState<SyncLogEntry[]>([]);

  useEffect(() => {
    const raw = window.localStorage.getItem('reader-settings');
    if (raw) setSettings({ ...defaults, ...(JSON.parse(raw) as Partial<Settings>) });
    setSyncLog(readSyncLog());
  }, []);

  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    window.localStorage.setItem('reader-settings', JSON.stringify(next));
  };

  const testConnection = async () => {
    setMessage('Testing connection...');
    const response = await fetch('/api/settings/test', { method: 'POST' });
    if (response.ok) {
      const result = (await response.json()) as { count: number };
      setMessage(`Connection ok, ${result.count} Markdown files found.`);
    } else {
      setMessage(`Error: ${await response.text()}`);
    }
  };

  const syncNow = async () => {
    setMessage('Syncing queue...');
    await flushPendingQueues();
    setSyncLog(readSyncLog());
    setMessage('Sync run finished.');
  };

  const clearLogs = () => {
    clearSyncLog();
    setSyncLog([]);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-[720px] flex-col gap-6 px-4 py-8 text-neutral-950 dark:text-neutral-50">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-400">
          These values are local UI defaults. Nextcloud credentials stay server-side in `.env`.
        </p>
      </div>

      <section className="grid gap-4">
        <label className="grid gap-2 text-sm font-medium">
          Nextcloud URL
          <Input value={settings.nextcloudUrl} onChange={(event) => update({ nextcloudUrl: event.target.value })} placeholder="https://nextcloud.example.com/remote.php/dav/files/user" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Nextcloud Username
          <Input value={settings.username} onChange={(event) => update({ username: event.target.value })} />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Nextcloud App-Password
          <Input type="password" value="" readOnly placeholder="Serverseitig in .env setzen" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Base path
          <Input value={settings.basePath} onChange={(event) => update({ basePath: event.target.value })} />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Sync interval minutes
          <Input type="number" min={5} value={settings.syncInterval} onChange={(event) => update({ syncInterval: event.target.value })} />
        </label>
      </section>

      <section className="grid gap-3">
        <h2 className="text-sm font-semibold">Theme</h2>
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
        <h2 className="text-sm font-semibold">Font size</h2>
        <div className="flex gap-2">
          {(['S', 'M', 'L'] as const).map((size) => (
            <Button key={size} type="button" variant={settings.fontSize === size ? 'default' : 'secondary'} onClick={() => update({ fontSize: size })}>
              {size}
            </Button>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={testConnection}>
          Test Connection
        </Button>
        {message ? <p className="text-sm text-neutral-700 dark:text-neutral-400">{message}</p> : null}
      </div>

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Sync-Log</h2>
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
    </main>
  );
}
