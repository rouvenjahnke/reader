// n8n Code node, run once for each item: create one Qdrant point per text chunk.
const paper = $('Merge + render markdown').item.json;
const embeddings = Array.isArray($json.data) ? $json.data : [];

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

const stableId = paper.semantic_scholar_paper_id || paper.arxiv_id || paper.doi || paper.title;
const chunks = Array.isArray(paper.text_chunks) && paper.text_chunks.length > 0
  ? paper.text_chunks
  : [paper.abstract || paper.title];
const points = chunks.map((chunk, index) => ({
  id: deterministicUUID(`${stableId}_chunk_${index}`),
  vector: embeddings[index]?.embedding || [],
  payload: {
    semantic_scholar_paper_id: paper.semantic_scholar_paper_id,
    arxiv_id: paper.arxiv_id,
    doi: paper.doi,
    title: paper.title,
    authors: paper.authors || [],
    primary_category: paper.primary_category,
    published_at: paper.published_at,
    score: paper.score,
    content_score: paper.content_score,
    source_priority: paper.source_priority,
    inclusion_reason: paper.inclusion_reason,
    matched_authors: paper.matched_authors || [],
    matched_topics: paper.matched_keywords || [],
    chunk_index: index,
    chunk_total: chunks.length,
    text_preview: chunk.slice(0, 500),
    type: 'preprint_chunk',
  },
}));

return {
  json: {
    ...paper,
    qdrant_points: points,
    qdrant_point_id: points[0]?.id || paper.qdrant_point_id,
    num_chunks: points.length,
  },
};
