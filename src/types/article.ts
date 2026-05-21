export type ReaderStatus = 'unrated' | 'irrelevant' | 'relevant' | 'high_relevant';

export interface ArticleFrontmatter {
  title: string;
  url?: string;
  author?: string;
  source?: string;
  fetched?: string;
  published?: string;
  type?: string;
  score?: number;
  priority?: number;
  tags?: string[];
  language?: string;
  arxiv_id?: string;
  primary_category?: string;
  reader_status?: ReaderStatus;
  reader_rated_at?: string;
  reader_read_seconds?: number;
  reader_priority?: number;
  reader_pinned?: boolean;
  [key: string]: unknown;
}

export interface ArticleSummary {
  id: string;
  path: string;
  etag?: string;
  lastModified?: string;
  size?: number;
  frontmatter: ArticleFrontmatter;
}

export interface Article extends ArticleSummary {
  body: string;
  raw?: string;
}

export type ArticleSortMode = 'newest' | 'score';

export interface ArticleFilters {
  sortMode: ArticleSortMode;
  statuses: ReaderStatus[];
  sources: string[];
  query: string;
  priorityOnly: boolean;
}

export interface PendingRating {
  id: string;
  path: string;
  status: Exclude<ReaderStatus, 'unrated'>;
  createdAt: string;
}

export interface PendingHighlight {
  id: string;
  path: string;
  text: string;
  createdAt: string;
}
