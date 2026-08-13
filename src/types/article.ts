export type ReaderStatus = 'unrated' | 'irrelevant' | 'relevant' | 'high_relevant';
export type ContentMode = 'articles' | 'papers';
export type PaperStatus = 'inbox' | 'skimmed' | 'reading' | 'reference' | 'dismissed';

export interface ArticleFrontmatter {
  title: string;
  url?: string;
  author?: string;
  source?: string;
  fetched?: string;
  published?: string;
  type?: string;
  /** Final 0-10 relevance score shown by the Reader. */
  score?: number;
  /** Raw 0-10 content score before the small source-weight adjustment. */
  content_score?: number;
  /** 0-10 source weight used by ingestion. Kept for audit, not displayed as a rank. */
  source_priority?: number;
  /** Formula identifier used to make scores auditable across pipeline revisions. */
  scoring_version?: string;
  /** Legacy source-priority field from older pipeline exports. */
  priority?: number;
  tags?: string[];
  language?: string;
  arxiv_id?: string;
  doi?: string;
  pdf_url?: string;
  html_url?: string;
  authors?: string[];
  primary_category?: string;
  all_categories?: string[];
  matched_authors?: string[];
  matched_topics?: string[];
  inclusion_reason?: string;
  reading_difficulty?: string;
  key_concepts?: string[];
  reader_status?: ReaderStatus;
  reader_rated_at?: string;
  reader_read_seconds?: number;
  /** Legacy automatic rank. Parsed for compatibility but intentionally ignored by sorting. */
  reader_priority?: number;
  reader_pinned?: boolean;
  reader_pinned_by?: string;
  reader_pinned_at?: string;
  paper_status?: PaperStatus;
  paper_status_updated_at?: string;
  reader_note?: string;
  reader_note_updated_at?: string;
  [key: string]: unknown;
}

/** Where a summary was loaded from: paper/preprint pipeline folders or the optional papers folder. */
export type ArticleCollection = 'papers';

/** Visibility of the optional papers folder in all views. */
export type PapersVisibility = 'shown' | 'only' | 'hidden';

export interface ArticleSummary {
  id: string;
  path: string;
  etag?: string;
  lastModified?: string;
  size?: number;
  /** Set to 'papers' for articles from paper/preprint paths. */
  collection?: ArticleCollection;
  /** Path below the configured reader pipeline root, e.g. "math_blogs/2026-08-12-post.md". */
  pipelineRelativePath?: string;
  /** First directory below the configured reader pipeline root, e.g. "math_blogs". */
  pipelineFolder?: string;
  frontmatter: ArticleFrontmatter;
  /** Client-side: ISO timestamp when this id was first observed on this device. */
  firstSeenAt?: string;
  /** Sibling summaries that were collapsed into this one by dedup. Winner only. */
  duplicates?: ArticleSummary[];
}

export interface Article extends ArticleSummary {
  body: string;
  raw?: string;
}

export type ArticleSortMode = 'newest' | 'score';

export interface ArticleFilters {
  sortMode: ArticleSortMode;
  statuses: ReaderStatus[];
  paperStatuses: PaperStatus[];
  sources: string[];
  tags: string[];
  folders: string[];
  /** People that caused a paper to be included by the watched-author workflow. */
  watchedAuthors: string[];
  /** Topics that caused a paper to be included by the watched-author workflow. */
  watchedTopics: string[];
  query: string;
  /** Show only Galois-source articles. */
  galoisOnly: boolean;
  /** Show only articles first observed within the last 24 hours. */
  newTodayOnly: boolean;
  /** When false, articles collapsed as duplicates are hidden from the list. */
  showDuplicates: boolean;
}

export interface PendingRating {
  id: string;
  path: string;
  status: Exclude<ReaderStatus, 'unrated'>;
  createdAt: string;
}

export interface PendingNote {
  /** Article id — one pending note per article, latest wins. */
  id: string;
  path: string;
  note: string;
  updatedAt: string;
}

export interface PendingHighlight {
  id: string;
  articleId: string;
  path: string;
  text: string;
  action?: 'add' | 'remove';
  occurrenceIndex?: number;
  createdAt: string;
}

export interface PendingPin {
  id: string;
  path: string;
  pinned: boolean;
  by: string;
  updatedAt: string;
}

export interface PendingPaperStatus {
  id: string;
  path: string;
  status: PaperStatus;
  updatedAt: string;
}
