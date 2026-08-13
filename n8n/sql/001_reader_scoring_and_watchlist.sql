BEGIN;

CREATE TABLE IF NOT EXISTS watched_authors (
  id BIGSERIAL PRIMARY KEY,
  display_name TEXT NOT NULL UNIQUE,
  semantic_scholar_author_id TEXT UNIQUE,
  orcid TEXT,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  source_priority NUMERIC(3, 1) NOT NULL DEFAULT 8.0
    CHECK (source_priority BETWEEN 0 AND 10),
  notify BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS watched_topics (
  id BIGSERIAL PRIMARY KEY,
  display_name TEXT NOT NULL UNIQUE,
  query TEXT NOT NULL,
  source_priority NUMERIC(3, 1) NOT NULL DEFAULT 6.0
    CHECK (source_priority BETWEEN 0 AND 10),
  notify BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO watched_authors (
  display_name,
  semantic_scholar_author_id,
  aliases,
  source_priority,
  notify,
  active
) VALUES
  ('Peter Scholze', NULL, ARRAY['P. Scholze'], 9.0, TRUE, FALSE),
  ('Bhargav Bhatt', NULL, ARRAY['B. Bhatt'], 9.0, TRUE, FALSE),
  ('Dustin Clausen', NULL, ARRAY['D. Clausen'], 8.5, TRUE, FALSE),
  ('Jacob Lurie', NULL, ARRAY['J. Lurie'], 9.0, TRUE, FALSE),
  ('Akhil Mathew', NULL, ARRAY['A. Mathew'], 8.0, FALSE, FALSE),
  ('Ravi Vakil', NULL, ARRAY['R. Vakil'], 8.0, FALSE, FALSE),
  ('Johan de Jong', NULL, ARRAY['A. J. de Jong', 'J. de Jong'], 8.0, FALSE, FALSE)
ON CONFLICT (display_name) DO NOTHING;

ALTER TABLE math_articles
  ADD COLUMN IF NOT EXISTS content_score REAL,
  ADD COLUMN IF NOT EXISTS source_priority REAL,
  ADD COLUMN IF NOT EXISTS scoring_version TEXT;

UPDATE math_articles
SET source_priority = priority
WHERE source_priority IS NULL
  AND priority IS NOT NULL
  AND priority BETWEEN 0 AND 10;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'math_articles'
      AND column_name = 'priority'
  ) THEN
    ALTER TABLE math_articles
      ALTER COLUMN priority DROP NOT NULL;
    COMMENT ON COLUMN math_articles.priority IS
      'Deprecated ambiguous source-priority field. Use source_priority.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'math_articles'
      AND column_name = 'reader_priority'
  ) THEN
    COMMENT ON COLUMN math_articles.reader_priority IS
      'Deprecated automatic rank. Explicit pins live in Reader Markdown frontmatter.';
  END IF;
END
$$;

INSERT INTO watched_topics (
  display_name,
  query,
  source_priority,
  notify,
  active
) VALUES
  ('Prismatic cohomology', 'prismatic cohomology', 7.0, FALSE, FALSE),
  ('Condensed mathematics', 'condensed mathematics', 7.0, FALSE, FALSE)
ON CONFLICT (display_name) DO NOTHING;

ALTER TABLE arxiv_papers
  ADD COLUMN IF NOT EXISTS semantic_scholar_paper_id TEXT,
  ADD COLUMN IF NOT EXISTS doi TEXT,
  ADD COLUMN IF NOT EXISTS score REAL,
  ADD COLUMN IF NOT EXISTS content_score REAL,
  ADD COLUMN IF NOT EXISTS source_priority REAL,
  ADD COLUMN IF NOT EXISTS scoring_version TEXT,
  ADD COLUMN IF NOT EXISTS paper_status TEXT NOT NULL DEFAULT 'inbox';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'math_articles_content_score_range'
      AND conrelid = 'public.math_articles'::regclass
  ) THEN
    ALTER TABLE math_articles
      ADD CONSTRAINT math_articles_content_score_range
      CHECK (content_score IS NULL OR content_score BETWEEN 0 AND 10);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'math_articles_source_priority_range'
      AND conrelid = 'public.math_articles'::regclass
  ) THEN
    ALTER TABLE math_articles
      ADD CONSTRAINT math_articles_source_priority_range
      CHECK (source_priority IS NULL OR source_priority BETWEEN 0 AND 10);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'arxiv_papers'
      AND column_name = 'composite_priority'
  ) THEN
    ALTER TABLE arxiv_papers
      ALTER COLUMN composite_priority DROP NOT NULL;
    COMMENT ON COLUMN arxiv_papers.composite_priority IS
      'Deprecated automatic rank. New ingestion writes score/content_score/source_priority.';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'arxiv_papers_score_range'
      AND conrelid = 'public.arxiv_papers'::regclass
  ) THEN
    ALTER TABLE arxiv_papers
      ADD CONSTRAINT arxiv_papers_score_range
      CHECK (score IS NULL OR score BETWEEN 0 AND 10);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'arxiv_papers_content_score_range'
      AND conrelid = 'public.arxiv_papers'::regclass
  ) THEN
    ALTER TABLE arxiv_papers
      ADD CONSTRAINT arxiv_papers_content_score_range
      CHECK (content_score IS NULL OR content_score BETWEEN 0 AND 10);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'arxiv_papers_source_priority_range'
      AND conrelid = 'public.arxiv_papers'::regclass
  ) THEN
    ALTER TABLE arxiv_papers
      ADD CONSTRAINT arxiv_papers_source_priority_range
      CHECK (source_priority IS NULL OR source_priority BETWEEN 0 AND 10);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'arxiv_papers_paper_status_valid'
      AND conrelid = 'public.arxiv_papers'::regclass
  ) THEN
    ALTER TABLE arxiv_papers
      ADD CONSTRAINT arxiv_papers_paper_status_valid
      CHECK (paper_status IN ('inbox', 'skimmed', 'reading', 'reference', 'dismissed'));
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS arxiv_papers_semantic_scholar_id_uidx
  ON arxiv_papers (semantic_scholar_paper_id)
  WHERE semantic_scholar_paper_id IS NOT NULL
    AND semantic_scholar_paper_id <> '';

CREATE UNIQUE INDEX IF NOT EXISTS arxiv_papers_doi_uidx
  ON arxiv_papers (LOWER(doi))
  WHERE doi IS NOT NULL
    AND doi <> '';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'math_pipeline') THEN
    GRANT SELECT ON watched_authors, watched_topics TO math_pipeline;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'reader_debug') THEN
    GRANT SELECT ON watched_authors, watched_topics TO reader_debug;
  END IF;
END
$$;

COMMIT;
