// n8n Code node: flatten Semantic Scholar responses and merge duplicate matches.
const lookbackDays = Math.max(1, Number($env.WATCH_LOOKBACK_DAYS || 14));
const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
const candidates = new Map();

const unique = (values) => [...new Set(values.filter(Boolean))];
const paperKey = (paper) =>
  paper.paperId ||
  paper.externalIds?.ArXiv ||
  paper.externalIds?.DOI ||
  String(paper.title || '').toLowerCase().replace(/\s+/g, '');

$input.all().forEach((response, responseIndex) => {
  const target = $('Load watched targets').itemMatching(responseIndex).json;
  const papers = Array.isArray(response.json.data) ? response.json.data : [];

  papers.forEach((paper) => {
    const publishedAt = paper.publicationDate || null;
    const publishedTime = publishedAt ? Date.parse(publishedAt) : Number.NaN;
    if (!Number.isFinite(publishedTime) || publishedTime < cutoff) return;

    const arxivId = paper.externalIds?.ArXiv || null;
    const doi = paper.externalIds?.DOI || null;
    const authors = (paper.authors || []).map((author) => author.name).filter(Boolean);
    const fields = Array.isArray(paper.fieldsOfStudy) ? paper.fieldsOfStudy : [];
    const pdfUrl = paper.openAccessPdf?.url || null;
    const htmlUrl = arxivId
      ? `https://arxiv.org/abs/${arxivId}`
      : doi
        ? `https://doi.org/${doi}`
        : paper.url || null;
    const isAuthorTarget = target.target_type === 'author';
    const key = paperKey(paper);
    const previous = candidates.get(key);

    const normalized = {
      semantic_scholar_paper_id: paper.paperId || null,
      arxiv_id: arxivId,
      doi,
      pdf_url: pdfUrl,
      html_url: htmlUrl,
      url: htmlUrl,
      fetch_url: arxivId ? `https://arxiv.org/html/${arxivId}` : pdfUrl || htmlUrl,
      title: paper.title || 'Untitled paper',
      authors,
      abstract: paper.abstract || '',
      published_at: publishedAt,
      updated_at: publishedAt,
      primary_category: arxivId ? 'arXiv' : fields[0] || 'unknown',
      all_categories: fields,
      msc_codes: [],
      matched_categories: [],
      matched_authors: isAuthorTarget ? [target.target_name] : [],
      matched_keywords: isAuthorTarget ? [] : [target.target_name],
      inclusion_reason: isAuthorTarget ? 'watched_author' : 'watched_topic',
      source_priority: Number(target.source_priority) || (isAuthorTarget ? 8 : 6),
      notify: Boolean(target.notify),
    };

    if (!previous) {
      candidates.set(key, normalized);
      return;
    }

    previous.matched_authors = unique([
      ...previous.matched_authors,
      ...normalized.matched_authors,
    ]);
    previous.matched_keywords = unique([
      ...previous.matched_keywords,
      ...normalized.matched_keywords,
    ]);
    previous.source_priority = Math.max(previous.source_priority, normalized.source_priority);
    previous.notify = previous.notify || normalized.notify;
    previous.inclusion_reason = previous.matched_authors.length > 0 && previous.matched_keywords.length > 0
      ? 'watched_author_and_topic'
      : previous.inclusion_reason;
  });
});

return [...candidates.values()].map((paper) => ({ json: paper }));
