import 'server-only';

import { deleteArticlesOlderThan } from '@/lib/nextcloud';

export type ArticleCleanupState = 'idle' | 'running' | 'completed' | 'failed';

export interface ArticleCleanupJob {
  state: ArticleCleanupState;
  olderThanDays?: number;
  deleted: number;
  failed: number;
  remaining?: number;
  skippedWithoutPublished: number;
  startedAt?: string;
  updatedAt?: string;
  finishedAt?: string;
  error?: string;
}

const BETWEEN_BATCHES_MS = 1_000;

let currentJob: ArticleCleanupJob = {
  state: 'idle',
  deleted: 0,
  failed: 0,
  skippedWithoutPublished: 0
};

export function getArticleCleanupJob(): ArticleCleanupJob {
  return { ...currentJob };
}

/** Start a process-local cleanup job. An already running job is returned unchanged. */
export function startArticleCleanup(olderThanDays: number): ArticleCleanupJob {
  if (currentJob.state === 'running') return getArticleCleanupJob();

  const now = new Date().toISOString();
  const job: ArticleCleanupJob = {
    state: 'running',
    olderThanDays,
    deleted: 0,
    failed: 0,
    skippedWithoutPublished: 0,
    startedAt: now,
    updatedAt: now
  };
  currentJob = job;

  void runCleanup(job);
  return getArticleCleanupJob();
}

async function runCleanup(job: ArticleCleanupJob): Promise<void> {
  try {
    while (job.state === 'running') {
      const result = await deleteArticlesOlderThan(job.olderThanDays ?? 0);
      job.deleted += result.deleted;
      job.failed += result.failed;
      job.remaining = result.remaining;
      job.skippedWithoutPublished = result.skippedWithoutPublished;
      job.updatedAt = new Date().toISOString();

      if (result.failed > 0) {
        finishJob(job, 'failed', `${result.failed} Löschvorgang/-vorgänge sind fehlgeschlagen.`);
        return;
      }
      if (result.remaining === 0) {
        finishJob(job, 'completed');
        return;
      }
      if (result.deleted === 0) {
        finishJob(job, 'failed', 'Der Cleanup konnte keinen weiteren Artikel löschen.');
        return;
      }

      await wait(BETWEEN_BATCHES_MS);
    }
  } catch (error) {
    finishJob(job, 'failed', error instanceof Error ? error.message : 'Unbekannter Cleanup-Fehler');
  }
}

function finishJob(job: ArticleCleanupJob, state: Extract<ArticleCleanupState, 'completed' | 'failed'>, error?: string): void {
  const now = new Date().toISOString();
  job.state = state;
  job.error = error;
  job.updatedAt = now;
  job.finishedAt = now;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
