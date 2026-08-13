// n8n Code node, run once for each item: merge extractor output with metadata.
const source = $('Continue if new').item.json;
let extracted = {};

try {
  extracted = JSON.parse($json.stdout || '{}');
} catch {
  extracted = { text_chunks: [source.abstract || source.title] };
}

const textChunks = Array.isArray(extracted.text_chunks)
  ? extracted.text_chunks.filter((chunk) => typeof chunk === 'string' && chunk.trim())
  : [];

return {
  json: {
    ...source,
    ...extracted,
    text_chunks: textChunks.length > 0
      ? textChunks
      : [source.abstract || source.title],
  },
};
