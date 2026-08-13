// n8n Code node, run once for each item: enrich, score, and render a Paper note.
const paper = $('Parse stdout').item.json;
let enrichment;

try {
  const raw = $json.choices?.[0]?.message?.content || '{}';
  enrichment = JSON.parse(raw.replace(/```json|```/g, '').trim());
} catch {
  enrichment = {
    summary_de: '',
    profile_connection: '',
    reading_difficulty: 'unknown',
    key_concepts: [],
    content_score: 5,
  };
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round1 = (value) => Math.round(value * 10) / 10;
const yamlString = (value) => JSON.stringify(String(value || ''));
const slugify = (value) => String(value || '')
  .toLowerCase()
  .replace(/\u00e4/g, 'ae')
  .replace(/\u00f6/g, 'oe')
  .replace(/\u00fc/g, 'ue')
  .replace(/\u00df/g, 'ss')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .substring(0, 60);
const deterministicUUID = (seed) => {
  const value = String(seed || 'unknown');
  let h1 = 0x9e3779b9;
  let h2 = 0x243f6a88;
  for (let index = 0; index < value.length; index += 1) {
    h1 = Math.imul(h1 ^ value.charCodeAt(index), 0x9e3779b9);
    h2 = Math.imul(h2 ^ value.charCodeAt(index), 0x6c62272e);
  }
  h1 = (h1 ^ (h1 >>> 16)) >>> 0;
  h2 = (h2 ^ (h2 >>> 16)) >>> 0;
  const h3 = Math.imul(h1, 0x85ebca6b) >>> 0;
  const h4 = Math.imul(h2, 0xc2b2ae35) >>> 0;
  const hex = (number, length) => number.toString(16).padStart(length, '0');
  return `${hex(h1, 8)}-${hex(h2 & 0xffff, 4)}-4${hex(h3 & 0xfff, 3)}-${hex((h4 & 0x3fff) | 0x8000, 4)}-${hex(h1, 8)}${hex(h2 & 0xffff, 4)}`;
};

const contentScore = clamp(Number(enrichment.content_score) || 5, 0, 10);
const parsedSourcePriority = Number(paper.source_priority);
const sourcePriority = clamp(Number.isFinite(parsedSourcePriority) ? parsedSourcePriority : 7, 0, 10);
const score = round1(0.85 * contentScore + 0.15 * sourcePriority);
const stableId = paper.semantic_scholar_paper_id || paper.arxiv_id || paper.doi || paper.title;
const pointId = deterministicUUID(`${stableId}_chunk_0`);
const date = (paper.published_at || new Date().toISOString()).split('T')[0];
const identifier = paper.arxiv_id
  ? `arxiv-${paper.arxiv_id.replace('/', '-')}`
  : `s2-${String(paper.semantic_scholar_paper_id || paper.doi || 'unknown').replace(/[^a-zA-Z0-9.-]+/g, '-')}`;
const filename = `${date}-${identifier}-${slugify(paper.title).substring(0, 30)}.md`;
const relativePath = `math_preprints/${filename}`;
const authors = Array.isArray(paper.authors) ? paper.authors : [];
const concepts = Array.isArray(enrichment.key_concepts) ? enrichment.key_concepts : [];
const categories = Array.isArray(paper.all_categories) ? paper.all_categories : [];
const tags = [...new Set(['paper', 'watched', ...categories.map(slugify)].filter(Boolean))];
const matchDescription = [
  paper.matched_authors?.length ? `authors: ${paper.matched_authors.join(', ')}` : null,
  paper.matched_keywords?.length ? `topics: ${paper.matched_keywords.join(', ')}` : null,
].filter(Boolean).join(' | ');
const extractedText = Array.isArray(paper.text_chunks)
  ? paper.text_chunks.filter(Boolean).join('\n\n')
  : '';

const frontmatter = `---\n` +
  `title: ${yamlString(paper.title)}\n` +
  `url: ${yamlString(paper.html_url || paper.url)}\n` +
  `source: "Semantic Scholar Watchlist"\n` +
  `author: ${yamlString(authors.join(', '))}\n` +
  `authors: ${JSON.stringify(authors)}\n` +
  `arxiv_id: ${yamlString(paper.arxiv_id)}\n` +
  `doi: ${yamlString(paper.doi)}\n` +
  `semantic_scholar_paper_id: ${yamlString(paper.semantic_scholar_paper_id)}\n` +
  `pdf_url: ${yamlString(paper.pdf_url)}\n` +
  `html_url: ${yamlString(paper.html_url)}\n` +
  `primary_category: ${yamlString(paper.primary_category)}\n` +
  `all_categories: ${JSON.stringify(categories)}\n` +
  `published: ${paper.published_at || ''}\n` +
  `fetched: ${new Date().toISOString()}\n` +
  `type: preprint\n` +
  `score: ${score.toFixed(1)}\n` +
  `content_score: ${contentScore.toFixed(1)}\n` +
  `source_priority: ${sourcePriority.toFixed(1)}\n` +
  `scoring_version: content-85_source-15_v1\n` +
  `reader_status: unrated\n` +
  `paper_status: inbox\n` +
  `reading_difficulty: ${yamlString(enrichment.reading_difficulty || 'unknown')}\n` +
  `inclusion_reason: ${yamlString(paper.inclusion_reason)}\n` +
  `matched_authors: ${JSON.stringify(paper.matched_authors || [])}\n` +
  `matched_topics: ${JSON.stringify(paper.matched_keywords || [])}\n` +
  `key_concepts: ${JSON.stringify(concepts)}\n` +
  `tags: ${JSON.stringify(tags)}\n` +
  `qdrant_point_id: ${pointId}\n` +
  `qdrant_collection: math_corpus\n` +
  `embedding_model: voyage-4-large\n` +
  `---\n`;

const body = `\n# ${paper.title}\n\n` +
  `**${authors.join(', ') || 'Unknown authors'}** - ${paper.primary_category || 'unknown'}\n\n` +
  `> [!info] Paper\n` +
  `> [Paper page](${paper.html_url || paper.url})${paper.pdf_url ? ` - [PDF](${paper.pdf_url})` : ''}\n` +
  `> Reader-Score: **${score.toFixed(1)}** ` +
  `(Inhalt ${contentScore.toFixed(1)}, Quelle ${sourcePriority.toFixed(1)})\n` +
  `> Inclusion: **${paper.inclusion_reason}**${matchDescription ? ` - ${matchDescription}` : ''}\n\n` +
  `## Abstract\n\n${paper.abstract || ''}\n\n` +
  (enrichment.summary_de ? `## Zusammenfassung (DE)\n\n${enrichment.summary_de}\n\n` : '') +
  (enrichment.profile_connection ? `## Profil-Relevanz\n\n${enrichment.profile_connection}\n\n` : '') +
  `## Wissenschaftliche Arbeit\n\n` +
  `- [ ] Abstract gelesen\n` +
  `- [ ] Hauptresultat identifiziert\n` +
  `- [ ] Beweisidee notiert\n` +
  `- [ ] Verbindungen zu bestehenden Notizen erfasst\n` +
  `- [ ] Zitation uebernommen\n\n` +
  (extractedText ? `---\n\n## Extrahierter Volltext\n\n${extractedText}\n` : '');

return {
  json: {
    ...paper,
    ...enrichment,
    content_score: contentScore,
    source_priority: sourcePriority,
    score,
    scoring_version: 'content-85_source-15_v1',
    qdrant_point_id: pointId,
    relative_path: relativePath,
    content: frontmatter + body,
  },
};
