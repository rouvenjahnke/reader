// n8n Code node: render the normalized Reader article format.
const deterministicUUID = (entryId) => {
  const id = String(entryId || '0');
  let h1 = 0x9e3779b9;
  let h2 = 0x243f6a88;
  for (let i = 0; i < id.length; i += 1) {
    h1 = Math.imul(h1 ^ id.charCodeAt(i), 0x9e3779b9);
    h2 = Math.imul(h2 ^ id.charCodeAt(i), 0x6c62272e);
  }
  h1 = (h1 ^ (h1 >>> 16)) >>> 0;
  h2 = (h2 ^ (h2 >>> 16)) >>> 0;
  const h3 = Math.imul(h1, 0x85ebca6b) >>> 0;
  const h4 = Math.imul(h2, 0xc2b2ae35) >>> 0;
  const toHex = (number, length) => number.toString(16).padStart(length, '0');
  return `${toHex(h1, 8)}-${toHex(h2 & 0xffff, 4)}-4${toHex(h3 & 0xfff, 3)}-${toHex((h4 & 0x3fff) | 0x8000, 4)}-${toHex(h1, 8)}${toHex(h2 & 0xffff, 4)}`;
};

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/\u00e4/g, 'ae')
    .replace(/\u00f6/g, 'oe')
    .replace(/\u00fc/g, 'ue')
    .replace(/\u00df/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60);

const yamlString = (value) => JSON.stringify(String(value || ''));

return $input.all().map((item, index) => {
  const article = $('Combined score + filter1').itemMatching(index).json;
  const vector = item.json.data?.[0]?.embedding || [];
  const pointId = deterministicUUID(article.miniflux_entry_id);
  const date = (article.published_at || new Date().toISOString()).split('T')[0];
  const filename = `${date}-${slugify(article.source_name)}-${article.miniflux_entry_id}-${slugify(article.resolved_title).substring(0, 30)}.md`;
  const subfolder = ['ai', 'ml'].includes(article.category) ? 'ai_blogs' : 'math_blogs';
  const relativePath = `${subfolder}/${filename}`;
  const tags = Array.isArray(article.tags) && article.tags.length > 0
    ? article.tags
    : ['blog'];
  const tagsYaml = tags.map((tag) => `  - ${yamlString(tag)}`).join('\n');
  const matchedTopics = JSON.stringify(article.matched_topics || []);

  const frontmatter = `---\n` +
    `title: ${yamlString(article.resolved_title)}\n` +
    `url: ${yamlString(article.url)}\n` +
    `author: ${yamlString(article.author || 'unknown')}\n` +
    `source: ${yamlString(article.source_name)}\n` +
    `fetched: ${new Date().toISOString()}\n` +
    `published: ${article.published_at || ''}\n` +
    `type: blog\n` +
    `score: ${article.score.toFixed(1)}\n` +
    `content_score: ${article.content_score.toFixed(1)}\n` +
    `source_priority: ${article.source_priority.toFixed(1)}\n` +
    `scoring_version: ${article.scoring_version}\n` +
    `language: ${article.language}\n` +
    `reader_status: unrated\n` +
    `tags:\n${tagsYaml}\n` +
    `# === pipeline-internal ===\n` +
    `category: ${article.category}\n` +
    `matched_topics: ${matchedTopics}\n` +
    `full_content_source: ${article.full_content_source}\n` +
    `content_truncated: ${Boolean(article.content_truncated)}\n` +
    `qdrant_point_id: ${pointId}\n` +
    `qdrant_collection: math_corpus\n` +
    `embedding_model: voyage-4-large\n` +
    `---\n`;

  const tagLine = tags.map((tag) => `#${tag}`).join(' ');
  const body = `\n# ${article.resolved_title}\n\n` +
    `**${article.author || 'unknown'}** - *${article.source_name}* - ${date}\n\n` +
    `${tagLine}\n\n` +
    `> [!info] Quelle\n` +
    `> [Original lesen](${article.url})\n` +
    `> Reader-Score: **${article.score.toFixed(1)}** ` +
    `(Inhalt ${article.content_score.toFixed(1)}, Quelle ${article.source_priority.toFixed(1)})\n\n` +
    `## Zusammenfassung\n\n${article.summary_de}\n\n` +
    `## Profil-Relevanz\n\n${article.profile_fit}\n\n` +
    (article.matched_topics?.length
      ? `## Themen\n\n${article.matched_topics.map((topic) => `- \`${topic}\``).join('\n')}\n\n`
      : '') +
    `---\n\n## Volltext\n\n${article.full_content_markdown || ''}\n`;

  return {
    json: {
      ...article,
      vector,
      qdrant_point_id: pointId,
      file_path: relativePath,
      relative_path: relativePath,
      content: frontmatter + body,
    },
  };
});
