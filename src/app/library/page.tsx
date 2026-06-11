'use client';

import { ArrowLeft, FileText, Star } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { loadCachedSummaries } from '@/lib/sync';
import { useArticleStore } from '@/stores/useArticleStore';
import type { ArticleSummary } from '@/types/article';

type GroupMode = 'month' | 'tag' | 'source';

const groupModes: Array<{ value: GroupMode; label: string }> = [
  { value: 'month', label: 'Month' },
  { value: 'tag', label: 'Tag' },
  { value: 'source', label: 'Source' }
];

interface Group {
  key: string;
  label: string;
  articles: ArticleSummary[];
}

export default function LibraryPage(): React.ReactElement {
  const router = useRouter();
  const articles = useArticleStore((state) => state.articles);
  const hydrated = useArticleStore((state) => state.hydrated);
  const hydrateArticles = useArticleStore((state) => state.hydrateArticles);
  const [groupMode, setGroupMode] = useState<GroupMode>('month');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (hydrated) return;
    void loadCachedSummaries().then((cached) => {
      if (cached.length > 0) hydrateArticles(cached);
    });
  }, [hydrated, hydrateArticles]);

  const kept = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return articles
      .filter((article) => {
        const status = article.frontmatter.reader_status;
        return status === 'relevant' || status === 'high_relevant';
      })
      .filter((article) => {
        if (!needle) return true;
        const fm = article.frontmatter;
        return (
          fm.title.toLowerCase().includes(needle) ||
          (fm.author ?? '').toLowerCase().includes(needle) ||
          (fm.source ?? '').toLowerCase().includes(needle) ||
          (fm.tags ?? []).some((tag) => tag.toLowerCase().includes(needle))
        );
      })
      .sort(byRatedAtDesc);
  }, [articles, query]);

  const groups = useMemo(() => buildGroups(kept, groupMode), [kept, groupMode]);
  const highCount = kept.filter((article) => article.frontmatter.reader_status === 'high_relevant').length;

  return (
    <main className="mx-auto flex min-h-screen max-w-[720px] flex-col gap-4 px-4 py-6">
      <header className="flex items-center justify-between gap-3 border-b border-hairline pb-3">
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="icon" onClick={() => router.push('/')} aria-label="Back to list">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="font-heading text-lg font-bold italic text-ink">Library</h1>
        </div>
        <p className="font-meta text-xs tabular-nums text-mutedink">
          {kept.length} kept · {highCount} high
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-sm border border-hairline">
          {groupModes.map((mode) => (
            <button
              key={mode.value}
              type="button"
              onClick={() => setGroupMode(mode.value)}
              className={
                groupMode === mode.value
                  ? 'bg-ink px-3 py-1.5 font-meta text-xs text-paper'
                  : 'bg-surface px-3 py-1.5 font-meta text-xs text-mutedink transition-colors hover:bg-surface-muted'
              }
            >
              {mode.label}
            </button>
          ))}
        </div>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter library…"
          className="h-8 max-w-56 flex-1"
        />
      </div>

      {!hydrated && articles.length === 0 ? <p className="font-meta text-xs text-mutedink">Loading…</p> : null}

      {hydrated && kept.length === 0 ? (
        <div className="py-24 text-center text-mutedink">
          {query ? 'No matches in the library.' : 'Nothing kept yet — rate articles as relevant or high to collect them here.'}
        </div>
      ) : null}

      <div className="flex flex-col gap-6 pb-12">
        {groups.map((group) => (
          <section key={group.key}>
            <div className="flex items-baseline justify-between gap-2 border-b border-hairline-strong pb-1.5">
              <h2 className="theorem-label text-mutedink">{group.label}</h2>
              <span className="font-meta text-[11px] tabular-nums text-mutedink">{group.articles.length}</span>
            </div>
            <ul>
              {group.articles.map((article) => (
                <LibraryRow key={`${group.key}:${article.id}`} article={article} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}

function LibraryRow({ article }: { article: ArticleSummary }): React.ReactElement {
  const fm = article.frontmatter;
  const high = fm.reader_status === 'high_relevant';
  const date = fm.reader_rated_at ?? fm.published ?? fm.fetched;

  return (
    <li>
      <Link
        href={`/article/${article.id}`}
        className="flex flex-col gap-1 border-b border-hairline px-1 py-2.5 transition-colors hover:bg-surface-muted"
      >
        <span className="flex items-start gap-2">
          {high ? <Star className="mt-1 h-3.5 w-3.5 shrink-0 fill-current text-accent" /> : null}
          <span className="font-heading text-[1.02rem] font-bold leading-snug text-ink">{fm.title}</span>
          {fm.reader_note ? <FileText className="ml-auto mt-1 h-3.5 w-3.5 shrink-0 text-mutedink" /> : null}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-meta text-[11px] text-mutedink">
          {fm.source ? <span>{fm.source}</span> : null}
          {fm.author ? <span className="max-w-56 truncate">{fm.author}</span> : null}
          {date ? <span>{formatDate(date)}</span> : null}
          {(fm.tags ?? []).slice(0, 3).map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </span>
      </Link>
    </li>
  );
}

function buildGroups(articles: ArticleSummary[], mode: GroupMode): Group[] {
  const map = new Map<string, Group>();

  const add = (key: string, label: string, article: ArticleSummary) => {
    const group = map.get(key) ?? { key, label, articles: [] };
    group.articles.push(article);
    map.set(key, group);
  };

  for (const article of articles) {
    const fm = article.frontmatter;
    if (mode === 'source') {
      const source = (fm.source ?? 'unknown').trim() || 'unknown';
      add(source.toLowerCase(), source, article);
    } else if (mode === 'tag') {
      const tags = fm.tags ?? [];
      if (tags.length === 0) add('∅', 'untagged', article);
      for (const tag of tags) add(tag.toLowerCase(), tag, article);
    } else {
      const iso = fm.reader_rated_at ?? fm.published ?? fm.fetched;
      const parsed = iso ? new Date(iso) : null;
      if (parsed && !Number.isNaN(parsed.getTime())) {
        const key = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
        add(key, parsed.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), article);
      } else {
        add('0000-00', 'undated', article);
      }
    }
  }

  const groups = Array.from(map.values());
  if (mode === 'month') {
    // Reverse-chronological by the YYYY-MM key; undated last.
    groups.sort((a, b) => (a.key < b.key ? 1 : -1));
  } else {
    groups.sort((a, b) => b.articles.length - a.articles.length || a.label.localeCompare(b.label));
  }
  return groups;
}

function byRatedAtDesc(a: ArticleSummary, b: ArticleSummary): number {
  const left = Date.parse(a.frontmatter.reader_rated_at ?? a.frontmatter.published ?? a.frontmatter.fetched ?? '') || 0;
  const right = Date.parse(b.frontmatter.reader_rated_at ?? b.frontmatter.published ?? b.frontmatter.fetched ?? '') || 0;
  return right - left;
}

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}
