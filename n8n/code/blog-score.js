// n8n Code node: one public score, with a deliberately small source component.
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round1 = (value) => Math.round(value * 10) / 10;

const CONTENT_WEIGHT = 0.85;
const SOURCE_WEIGHT = 0.15;
const ACCEPTANCE_SCORE = 6.0;

return $input.all().map((item, index) => {
  const prepared = $('Parse content (or fallback)1').itemMatching(index).json;
  let llm;

  try {
    const raw = item.json.choices?.[0]?.message?.content || '{}';
    llm = JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch {
    llm = {
      summary_de: '(parse error)',
      profile_fit: '',
      tags: [],
      matched_topics: [],
      score: 0,
      language: 'unknown',
    };
  }

  const contentScore = clamp(Number(llm.score) || 0, 0, 10);
  const parsedSourcePriority = Number(prepared.source_priority);
  const sourcePriority = clamp(Number.isFinite(parsedSourcePriority) ? parsedSourcePriority : 5, 0, 10);
  const score = round1(
    CONTENT_WEIGHT * contentScore + SOURCE_WEIGHT * sourcePriority,
  );
  const isTaoSource =
    [45, 65].includes(Number(prepared.feed_id)) ||
    /(?:terry|terence) tao|what's new/i.test(prepared.source_name || '');

  return {
    json: {
      ...prepared,
      summary_de: llm.summary_de || '',
      profile_fit: llm.profile_fit || '',
      tags: Array.isArray(llm.tags) ? llm.tags : [],
      matched_topics: Array.isArray(llm.matched_topics) ? llm.matched_topics : [],
      content_score: contentScore,
      source_priority: sourcePriority,
      score,
      scoring_version: 'content-85_source-15_v1',
      language: llm.language || 'unknown',
      // Tao is a completeness exception. It does not imply a pin.
      accept: isTaoSource || score >= ACCEPTANCE_SCORE,
    },
  };
});
