// n8n Code node, run once for each item: fallback when no full-text URL exists.
return {
  json: {
    stdout: JSON.stringify({
      text_chunks: [$json.abstract || $json.title],
      full_content_source: 'abstract',
    }),
  },
};
