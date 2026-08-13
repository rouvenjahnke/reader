'use client';

import Fuse from 'fuse.js';
import { ArrowUpDown, FileText, LibraryBig, ListChecks, Moon, Newspaper, RefreshCw, Settings, Sparkles, Sun, SunMoon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useArticleStore } from '@/stores/useArticleStore';
import type { ArticleSummary } from '@/types/article';

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

/**
 * Global Ctrl/⌘K palette: fuzzy article search plus app commands.
 * Mounted once in the root layout; opens via keyboard or the
 * `reader:open-palette` window event.
 */
export function CommandPalette(): React.ReactElement | null {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const articles = useArticleStore((state) => state.articles);
  const setSortMode = useArticleStore((state) => state.setSortMode);
  const setContentMode = useArticleStore((state) => state.setContentMode);
  const toggleGaloisOnly = useArticleStore((state) => state.toggleGaloisOnly);
  const toggleNewTodayOnly = useArticleStore((state) => state.toggleNewTodayOnly);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
  }, []);

  const commands = useMemo<Command[]>(
    () => [
      { id: 'go-articles', label: 'Open articles', icon: <Newspaper className="h-4 w-4" />, run: () => { setContentMode('articles'); router.push('/'); } },
      { id: 'go-papers', label: 'Open papers', icon: <FileText className="h-4 w-4" />, run: () => { setContentMode('papers'); router.push('/'); } },
      { id: 'go-triage', label: 'Go to article triage', hint: 't', icon: <ListChecks className="h-4 w-4" />, run: () => { setContentMode('articles'); router.push('/triage'); } },
      { id: 'go-library', label: 'Go to article library', hint: 'b', icon: <LibraryBig className="h-4 w-4" />, run: () => { setContentMode('articles'); router.push('/library'); } },
      { id: 'go-settings', label: 'Go to settings', icon: <Settings className="h-4 w-4" />, run: () => router.push('/settings') },
      { id: 'sync', label: 'Sync now', icon: <RefreshCw className="h-4 w-4" />, run: () => window.dispatchEvent(new CustomEvent('reader:sync')) },
      { id: 'sort-newest', label: 'Sort by added date', icon: <ArrowUpDown className="h-4 w-4" />, run: () => setSortMode('newest') },
      { id: 'sort-score', label: 'Sort by score', icon: <ArrowUpDown className="h-4 w-4" />, run: () => setSortMode('score') },
      { id: 'toggle-today', label: 'Toggle filter: new today', icon: <Sparkles className="h-4 w-4" />, run: toggleNewTodayOnly },
      { id: 'toggle-galois', label: 'Toggle filter: Galois only', icon: <Sparkles className="h-4 w-4" />, run: () => { setContentMode('articles'); toggleGaloisOnly(); } },
      { id: 'theme-light', label: 'Theme: light', icon: <Sun className="h-4 w-4" />, run: () => setTheme('light') },
      { id: 'theme-dark', label: 'Theme: dark', icon: <Moon className="h-4 w-4" />, run: () => setTheme('dark') },
      { id: 'theme-system', label: 'Theme: system', icon: <SunMoon className="h-4 w-4" />, run: () => setTheme('system') }
    ],
    [router, setContentMode, setSortMode, setTheme, toggleGaloisOnly, toggleNewTodayOnly]
  );

  const articleFuse = useMemo(
    () =>
      new Fuse(articles, {
        threshold: 0.35,
        ignoreLocation: true,
        keys: [
          'frontmatter.title', 'frontmatter.author', 'frontmatter.authors', 'frontmatter.tags', 'frontmatter.source',
          'frontmatter.arxiv_id', 'frontmatter.doi', 'frontmatter.matched_authors', 'frontmatter.matched_topics',
          'pipelineFolder', 'pipelineRelativePath', 'path'
        ]
      }),
    [articles]
  );

  const trimmed = query.trim();
  const matchedCommands = useMemo(() => {
    if (!trimmed) return commands;
    const fuse = new Fuse(commands, { threshold: 0.4, ignoreLocation: true, keys: ['label'] });
    return fuse.search(trimmed).map((entry) => entry.item);
  }, [commands, trimmed]);

  const matchedArticles = useMemo<ArticleSummary[]>(() => {
    if (!trimmed) return [];
    return articleFuse
      .search(trimmed)
      .slice(0, 12)
      .map((entry) => entry.item);
  }, [articleFuse, trimmed]);

  const totalItems = matchedCommands.length + matchedArticles.length;

  const runItem = useCallback(
    (index: number) => {
      if (index < matchedCommands.length) {
        matchedCommands[index].run();
      } else {
        const article = matchedArticles[index - matchedCommands.length];
        if (article) {
          setContentMode(article.collection === 'papers' ? 'papers' : 'articles');
          router.push(`/article/${article.id}`);
        }
      }
      close();
    },
    [close, matchedArticles, matchedCommands, router, setContentMode]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
        return;
      }
      if (event.key === 'Escape') close();
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('reader:open-palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('reader:open-palette', onOpen);
    };
  }, [close]);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [trimmed]);

  useEffect(() => {
    const active = listRef.current?.querySelector('[data-active="true"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/30 px-3 pt-[12vh] backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Command palette">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close palette" onClick={close} />
      <div className="relative mx-auto flex max-h-[min(60vh,540px)] w-full max-w-[600px] flex-col overflow-hidden rounded-sm border border-hairline bg-surface text-ink shadow-2xl">
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActiveIndex((value) => Math.min(totalItems - 1, value + 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((value) => Math.max(0, value - 1));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              runItem(activeIndex);
            }
          }}
          placeholder="Search articles, papers, or commands…"
          className="border-b border-hairline bg-transparent px-4 py-3.5 font-meta text-sm outline-none placeholder:text-mutedink"
        />
        <div ref={listRef} className="overflow-y-auto p-2">
          {matchedCommands.length > 0 ? <p className="theorem-label px-2 pb-1 pt-2 text-mutedink">Commands</p> : null}
          {matchedCommands.map((command, index) => (
            <PaletteRow key={command.id} active={index === activeIndex} onSelect={() => runItem(index)} onHover={() => setActiveIndex(index)}>
              <span className="text-mutedink">{command.icon}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{command.label}</span>
              {command.hint ? <kbd className="theorem-label rounded-sm border border-hairline px-1.5 py-0.5 text-mutedink">{command.hint}</kbd> : null}
            </PaletteRow>
          ))}
          {matchedArticles.length > 0 ? <p className="theorem-label px-2 pb-1 pt-3 text-mutedink">Articles &amp; papers</p> : null}
          {matchedArticles.map((article, index) => {
            const itemIndex = matchedCommands.length + index;
            return (
              <PaletteRow key={article.id} active={itemIndex === activeIndex} onSelect={() => runItem(itemIndex)} onHover={() => setActiveIndex(itemIndex)}>
                <FileText className="h-4 w-4 shrink-0 text-mutedink" />
                <span className="min-w-0 flex-1 truncate text-sm">{article.frontmatter.title}</span>
                <span className="theorem-label shrink-0 text-mutedink">{article.frontmatter.source ?? article.pipelineFolder ?? ''}</span>
              </PaletteRow>
            );
          })}
          {totalItems === 0 ? <p className="px-3 py-8 text-center text-sm text-mutedink">No matches.</p> : null}
        </div>
        <div className="flex items-center gap-3 border-t border-hairline px-4 py-2 font-meta text-[10px] text-mutedink">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}

function PaletteRow({
  active,
  onSelect,
  onHover,
  children
}: {
  active: boolean;
  onSelect: () => void;
  onHover: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      data-active={active}
      onClick={onSelect}
      onMouseMove={onHover}
      className={`flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left transition-colors ${active ? 'bg-accent-soft text-accent-soft-fg' : 'hover:bg-surface-muted'}`}
    >
      {children}
    </button>
  );
}
