# Reader ingestion workflows

The tracked JSON files are sanitized n8n import templates. They are inactive on
purpose and contain credential references, but no API tokens or passwords.

## Architecture

```text
Miniflux RSS -> Pipeline_Math_AI_Blogs -> math_blogs / ai_blogs -> Reader: Articles
Semantic Scholar -> Pipeline_Watched_Authors -> math_preprints -> Reader: Papers
OpenClaw / Reader action -> explicit reader_pinned flag in the Markdown file
```

Miniflux remains the RSS discovery and triage layer. Watched-author papers do not
go through Miniflux: they are durable research objects and enter the Paper inbox
directly. This keeps newsletter/blog triage separate from scientific work while
both still live in the same Reader and Nextcloud tree.

The only visible relevance score is between 0 and 10:

```text
score = 0.85 * content_score + 0.15 * source_priority
```

`content_score` is assigned without considering author prestige. The small
`source_priority` component then makes a Tao or Scholze item somewhat more likely
to rank above an otherwise comparable generic source. The old automatic
`reader_priority`/`composite_priority` rank and automatic pinning are not used.
A pin is now an explicit user or assistant decision.

## Deploy

1. Apply the database migration to `math_corpus` before importing the watchlist
   workflow:

   ```bash
   psql "$DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 \
     -f n8n/sql/001_reader_scoring_and_watchlist.sql
   ```

   Use the PostgreSQL owner/admin connection here because the existing Reader
   tables have different owners. The workflow itself continues to use the
   restricted `math-corpus-pg` credential.

2. Add the stable Semantic Scholar author IDs, verify the matches, and activate
   only the rows you want. The ID is the numeric ID in the author's Semantic
   Scholar profile URL.

   ```sql
   UPDATE watched_authors
   SET semantic_scholar_author_id = '<verified-id>',
       active = TRUE,
       updated_at = NOW()
   WHERE display_name = 'Peter Scholze';

   UPDATE watched_topics
   SET active = TRUE,
       updated_at = NOW()
   WHERE display_name = 'Prismatic cohomology';
   ```

   Seeded authors and topics start inactive because silently selecting a
   same-name Semantic Scholar profile would be worse than requiring one verified
   ID once.

3. Import `Pipeline_Math_AI_Blogs.json` and
   `Pipeline_Watched_Authors.json` into n8n. Reconnect these credentials if n8n
   does not resolve the references automatically:

   - Miniflux HTTP header auth
   - `math-corpus-pg`
   - LiteLLM HTTP header auth
   - Qdrant API
   - Nextcloud basic auth

4. Configure n8n environment variables:

   ```text
   TELEGRAM_BOT_TOKEN=...
   TELEGRAM_CHAT_ID=...
   SEMANTIC_SCHOLAR_API_KEY=...
   WATCH_LOOKBACK_DAYS=14
   ```

   Telegram variables are needed only for notifications. A Semantic Scholar API
   key avoids the shared anonymous rate limit; requests are batched at one per
   1.1 seconds. The lookback defaults to 14 days.

5. Run each workflow manually while it is inactive. Verify one Nextcloud file,
   its matching PostgreSQL row, and its Reader entry before activating it. The
   blog workflow is hourly; the watched-author workflow runs daily at 06:15 in
   `Europe/Berlin`.

## OpenClaw pinning

OpenClaw should not alter the score. It can make a deliberate, auditable pin via
the Reader API after finding the article ID in `GET /api/articles`:

```bash
curl -X POST "$READER_URL/api/articles/$ARTICLE_ID/pin" \
  -H "Authorization: Bearer $READER_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pinned":true,"by":"openclaw"}'
```

This writes `reader_pinned`, `reader_pinned_by`, and `reader_pinned_at` to the
Markdown file. Unpinning uses the same endpoint with `"pinned": false`.

## Regenerating templates

The private raw n8n exports are ignored by Git. When either raw export changes,
regenerate and re-check the sanitized templates:

```bash
npm run workflows:build
npm test
```
