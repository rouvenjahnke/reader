import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const sourcePaths = {
  blogs: path.join(root, 'Pipeline_Math_AI_Blogs (6).json'),
  watched: path.join(root, 'Pipeline_Watched_Authors (1).json'),
};
const outputDirectory = path.join(root, 'n8n');
const codeDirectory = path.join(outputDirectory, 'code');

const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const readCode = async (name) => fs.readFile(path.join(codeDirectory, name), 'utf8');
const clone = (value) => structuredClone(value);

function getNode(workflow, name) {
  const node = workflow.nodes.find((candidate) => candidate.name === name);
  if (!node) throw new Error(`Missing n8n node: ${name}`);
  return node;
}

function renameNode(workflow, oldName, newName) {
  const node = getNode(workflow, oldName);
  node.name = newName;

  if (workflow.connections[oldName]) {
    workflow.connections[newName] = workflow.connections[oldName];
    delete workflow.connections[oldName];
  }

  Object.values(workflow.connections).forEach((connectionGroup) => {
    Object.values(connectionGroup).forEach((outputs) => {
      outputs.flat().forEach((connection) => {
        if (connection.node === oldName) connection.node = newName;
      });
    });
  });

  return node;
}

function replaceNode(node, { type, typeVersion, parameters, credentials, position }) {
  node.type = type;
  node.typeVersion = typeVersion;
  node.parameters = parameters;
  if (credentials) node.credentials = clone(credentials);
  else delete node.credentials;
  if (position) node.position = position;
  delete node.webhookId;
  return node;
}

function condition(leftValue, operation, rightValue = '') {
  const operator = { type: 'string', operation };
  if (operation === 'notEmpty') operator.singleValue = true;
  return {
    conditions: {
      options: {
        caseSensitive: false,
        leftValue: '',
        typeValidation: 'strict',
        version: 3,
      },
      conditions: [{
        leftValue,
        rightValue,
        operator,
      }],
      combinator: 'and',
    },
  };
}

function connection(node, index = 0) {
  return { node, type: 'main', index };
}

function importTemplate(workflow, name) {
  return {
    name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    active: false,
    settings: {
      ...workflow.settings,
      executionOrder: 'v1',
      timezone: 'Europe/Berlin',
    },
    pinData: {},
    tags: [],
  };
}

function sanitizeMinifluxNode(node, credentials) {
  node.parameters.authentication = 'genericCredentialType';
  node.parameters.genericAuthType = 'httpHeaderAuth';
  node.parameters.sendHeaders = false;
  delete node.parameters.headerParameters;
  node.credentials = clone(credentials);
}

function sanitizeQdrantNode(node, credentials) {
  const headers = node.parameters.headerParameters?.parameters || [];
  node.parameters.headerParameters = {
    parameters: headers.filter((header) => header.name?.toLowerCase() !== 'api-key'),
  };
  node.credentials = clone(credentials);
}

function assertSanitized(workflow) {
  const serialized = JSON.stringify(workflow);
  const forbidden = [
    /bot\d+:[A-Za-z0-9_-]+/,
    /"name":"X-Auth-Token"/i,
    /"name":"api-key"/i,
    /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
    /__n8n_BLANK_VALUE_/,
  ];
  const match = forbidden.find((pattern) => pattern.test(serialized));
  if (match) throw new Error(`Generated workflow still contains a forbidden secret pattern: ${match}`);
}

const [blogSource, watchedSource] = await Promise.all([
  readJson(sourcePaths.blogs),
  readJson(sourcePaths.watched),
]);

const sharedCredentials = {
  postgres: clone(getNode(blogSource, 'Postgres INSERT1').credentials),
  miniflux: clone(getNode(watchedSource, 'HTTP Request').credentials),
  llm: clone(getNode(blogSource, 'LLM enrich + score1').credentials),
  qdrant: {
    qdrantApi: clone(getNode(blogSource, 'Qdrant upsert1').credentials.qdrantApi),
  },
  nextcloud: {
    httpBasicAuth: clone(getNode(blogSource, 'Nextcloud Write FIle').credentials.httpBasicAuth),
  },
};

async function buildBlogWorkflow() {
  const workflow = clone(blogSource);
  workflow.nodes = workflow.nodes.filter((node) => node.name !== 'Execute a SQL query');
  const scoreNode = renameNode(workflow, 'Combined filter + priority1', 'Combined score + filter1');
  scoreNode.parameters.jsCode = await readCode('blog-score.js');
  getNode(workflow, 'Render MD (App format)1').parameters.jsCode = await readCode('blog-render.js');

  ['Miniflux GET unread1', 'Miniflux mark read1', 'Miniflux mark read (rejected)']
    .forEach((name) => sanitizeMinifluxNode(getNode(workflow, name), sharedCredentials.miniflux));

  const qdrant = getNode(workflow, 'Qdrant upsert1');
  sanitizeQdrantNode(qdrant, sharedCredentials.qdrant);
  qdrant.parameters.jsonBody = `={{ {
  "points": [{
    "id": $json.qdrant_point_id,
    "vector": $json.vector,
    "payload": {
      "title": $json.resolved_title,
      "url": $json.url,
      "source": $json.source_name,
      "category": $json.category,
      "score": $json.score,
      "content_score": $json.content_score,
      "source_priority": $json.source_priority,
      "scoring_version": $json.scoring_version,
      "published_at": $json.published_at || "",
      "language": $json.language,
      "tags": $json.tags || [],
      "summary_de": $json.summary_de
    }
  }]
} }}`;

  const insert = getNode(workflow, 'Postgres INSERT1');
  insert.parameters.query = `INSERT INTO math_articles (
  miniflux_entry_id, source_id, url, title, author, published_at,
  summary, content_markdown, content_truncated, tags, language,
  type, score, content_score, source_priority, scoring_version, profile_fit, reader_status,
  nextcloud_path, qdrant_point_id, qdrant_collection, embedding_model, status
) VALUES (
  $1::bigint, $2::int, $3, $4, $5, $6::timestamptz,
  $7, $8, $9::boolean, $10::text[], $11,
  'blog', $12::float, $13::float, $14::float, $15, $16, 'unrated',
  $17, $18::uuid, 'math_corpus', 'voyage-4-large', 'inbox'
) ON CONFLICT (url) DO NOTHING;`;
  insert.parameters.options = {
    queryReplacement: `={{ [
  $('Render MD (App format)1').item.json.miniflux_entry_id,
  $('Render MD (App format)1').item.json.source_id,
  $('Render MD (App format)1').item.json.url,
  $('Render MD (App format)1').item.json.resolved_title,
  $('Render MD (App format)1').item.json.author,
  $('Render MD (App format)1').item.json.published_at || null,
  $('Render MD (App format)1').item.json.summary_de,
  $('Render MD (App format)1').item.json.full_content_markdown,
  $('Render MD (App format)1').item.json.content_truncated,
  $('Render MD (App format)1').item.json.tags || [],
  $('Render MD (App format)1').item.json.language,
  $('Render MD (App format)1').item.json.score,
  $('Render MD (App format)1').item.json.content_score,
  $('Render MD (App format)1').item.json.source_priority,
  $('Render MD (App format)1').item.json.scoring_version,
  $('Render MD (App format)1').item.json.profile_fit,
  $('Render MD (App format)1').item.json.relative_path,
  $('Render MD (App format)1').item.json.qdrant_point_id
] }}`,
  };

  getNode(workflow, 'Update state1').parameters.query = `WITH stats AS (
  SELECT COUNT(*) AS total,
         COUNT(*) FILTER (WHERE bs.category = 'math') AS math_count,
         COUNT(*) FILTER (WHERE bs.category IN ('ai','ml')) AS ai_count
  FROM math_articles ma
  JOIN blog_sources bs ON ma.source_id = bs.id
  WHERE ma.fetched_at >= NOW() - INTERVAL '1 hour'
)
UPDATE pipeline_state
SET last_query_at = NOW(),
    last_success_at = NOW(),
    items_accepted_total = items_accepted_total + (SELECT total FROM stats)
WHERE source = 'blogs'
RETURNING (SELECT total FROM stats) AS total_today,
          (SELECT math_count FROM stats) AS math_today,
          (SELECT ai_count FROM stats) AS ai_today;`;

  const telegram = getNode(workflow, 'Telegram notify1');
  telegram.parameters.url = '=https://api.telegram.org/bot{{$env.TELEGRAM_BOT_TOKEN}}/sendMessage';
  telegram.parameters.jsonBody = `={{ {
  "chat_id": $env.TELEGRAM_CHAT_ID,
  "text": "Blog pipeline done\\n\\nTotal: " + $json.total_today + "\\nMath: " + $json.math_today + "\\nAI/ML: " + $json.ai_today
} }}`;

  workflow.active = false;
  const output = importTemplate(workflow, 'Pipeline_Math_AI_Blogs');
  assertSanitized(output);
  return output;
}

async function buildWatchedWorkflow() {
  const workflow = clone(watchedSource);
  workflow.nodes = workflow.nodes.filter((node) => !['Telegram notify', 'HTTP Request'].includes(node.name));
  const load = renameNode(workflow, 'Watched authors list', 'Load watched targets');
  replaceNode(load, {
    type: 'n8n-nodes-base.postgres',
    typeVersion: 2.6,
    position: [224, 0],
    credentials: sharedCredentials.postgres,
    parameters: {
      operation: 'executeQuery',
      query: `SELECT 'author'::text AS target_type,
       id AS target_id,
       display_name AS target_name,
       semantic_scholar_author_id,
       NULL::text AS query,
       source_priority,
       notify
FROM watched_authors
WHERE active = TRUE
  AND semantic_scholar_author_id IS NOT NULL
UNION ALL
SELECT 'topic'::text AS target_type,
       id AS target_id,
       display_name AS target_name,
       NULL::text AS semantic_scholar_author_id,
       query,
       source_priority,
       notify
FROM watched_topics
WHERE active = TRUE
ORDER BY target_type, target_name;`,
      options: {},
    },
  });

  const fetchPapers = renameNode(workflow, 'Fetch papers', 'Fetch watched papers');
  replaceNode(fetchPapers, {
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.4,
    position: [464, 0],
    parameters: {
      url: `={{ $json.target_type === 'author'
  ? 'https://api.semanticscholar.org/graph/v1/author/' + encodeURIComponent($json.semantic_scholar_author_id) + '/papers?limit=500&fields=' + encodeURIComponent('paperId,externalIds,url,title,abstract,year,publicationDate,authors,fieldsOfStudy,publicationTypes,openAccessPdf,isOpenAccess')
  : 'https://api.semanticscholar.org/graph/v1/paper/search/bulk?query=' + encodeURIComponent($json.query || $json.target_name) + '&sort=publicationDate:desc&publicationDateOrYear=' + new Date(Date.now() - Number($env.WATCH_LOOKBACK_DAYS || 14) * 86400000).toISOString().slice(0, 10) + ':&fields=' + encodeURIComponent('paperId,externalIds,url,title,abstract,year,publicationDate,authors,fieldsOfStudy,publicationTypes,openAccessPdf,isOpenAccess') }}`,
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'x-api-key', value: '={{ $env.SEMANTIC_SCHOLAR_API_KEY }}' },
        ],
      },
      options: {
        batching: { batch: { batchSize: 1, batchInterval: 1100 } },
        timeout: 60000,
      },
    },
  });
  fetchPapers.retryOnFail = true;
  fetchPapers.maxTries = 5;
  fetchPapers.waitBetweenTries = 2000;

  const parse = getNode(workflow, 'Parse + flatten');
  parse.position = [944, 0];
  parse.parameters = { mode: 'runOnceForAllItems', jsCode: await readCode('watched-parse.js') };

  const dedup = getNode(workflow, 'Dedup check');
  dedup.position = [1184, 0];
  dedup.credentials = clone(sharedCredentials.postgres);
  dedup.parameters = {
    operation: 'executeQuery',
    query: `SELECT EXISTS (
  SELECT 1
  FROM arxiv_papers
  WHERE (NULLIF($1, '') IS NOT NULL AND arxiv_id = NULLIF($1, ''))
     OR (NULLIF($2, '') IS NOT NULL AND LOWER(doi) = LOWER(NULLIF($2, '')))
     OR (NULLIF($3, '') IS NOT NULL AND semantic_scholar_paper_id = NULLIF($3, ''))
     OR LOWER(REGEXP_REPLACE(title, '\\s+', '', 'g')) =
        LOWER(REGEXP_REPLACE($4, '\\s+', '', 'g'))
) AS is_duplicate;`,
    options: {
      queryReplacement: `={{ [
  $json.arxiv_id || '',
  $json.doi || '',
  $json.semantic_scholar_paper_id || '',
  $json.title
] }}`,
    },
  };

  const continueNode = renameNode(workflow, 'If', 'Continue if new');
  replaceNode(continueNode, {
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1424, 0],
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: await readCode('watched-continue-if-new.js'),
    },
  });

  const routeContent = renameNode(workflow, 'Switch', 'Route full text');
  replaceNode(routeContent, {
    type: 'n8n-nodes-base.switch',
    typeVersion: 3.4,
    position: [1664, 0],
    parameters: {
      rules: {
        values: [
          condition('={{ $json.arxiv_id }}', 'notEmpty'),
          condition('={{ $json.pdf_url }}', 'notEmpty'),
          condition('={{ $json.html_url }}', 'notEmpty'),
        ],
      },
      options: { fallbackOutput: 'extra' },
    },
  });

  const arxiv = getNode(workflow, 'Execute Command');
  arxiv.position = [1904, -240];
  arxiv.parameters.command = `=/opt/pipeline-mvp/venv/bin/python /opt/pipeline-mvp/scripts/fetch_arxiv_chunks.py '{{ JSON.stringify($json) }}'`;
  const pdf = getNode(workflow, 'Execute Command1');
  pdf.position = [1904, -80];
  pdf.parameters.command = `=/opt/pipeline-mvp/venv/bin/python /opt/pipeline-mvp/scripts/fetch_pdf_chunks.py '{{ JSON.stringify($json) }}'`;
  const html = getNode(workflow, 'Execute Command2');
  html.position = [1904, 80];
  html.parameters.command = `=/opt/pipeline-mvp/venv/bin/python /opt/pipeline-mvp/scripts/fetch_html_chunks.py '{{ JSON.stringify($json) }}'`;

  const useAbstract = {
    id: '3dbf07fa-cad4-4aac-a38b-0ccfb5c4e45a',
    name: 'Use abstract',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1904, 240],
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: await readCode('watched-use-abstract.js'),
    },
  };
  workflow.nodes.push(useAbstract);

  const parseStdout = getNode(workflow, 'Parse stdout');
  parseStdout.position = [2144, 0];
  parseStdout.parameters = {
    mode: 'runOnceForEachItem',
    jsCode: await readCode('watched-parse-content.js'),
  };

  const llm = renameNode(workflow, 'LLM enrich (no filter!)', 'LLM enrich + content score');
  llm.position = [2384, 0];
  llm.typeVersion = 4.4;
  llm.credentials = clone(sharedCredentials.llm);
  llm.parameters = {
    method: 'POST',
    url: 'http://192.168.66.112:4000/chat/completions',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={{ {
  "model": "openai/gpt-4o",
  "messages": [
    {
      "role": "system",
      "content": "Return only valid JSON: {\\"summary_de\\":\\"2-3 German sentences\\",\\"profile_connection\\":\\"one sentence\\",\\"reading_difficulty\\":\\"accessible|graduate|research\\",\\"key_concepts\\":[\\"concept\\"],\\"content_score\\":0}. content_score must be a number from 0 to 10 and rate relevance and substance, independent of author prestige."
    },
    {
      "role": "user",
      "content": $('Parse stdout').item.json.title + "\\n\\nAuthors: " + ($('Parse stdout').item.json.authors || []).join(', ') + "\\n\\nAbstract:\\n" + ($('Parse stdout').item.json.abstract || '').slice(0, 4000)
    }
  ]
} }}`,
    options: { timeout: 60000 },
  };

  const render = getNode(workflow, 'Merge + render markdown');
  render.position = [2624, 0];
  render.parameters = {
    mode: 'runOnceForEachItem',
    jsCode: await readCode('watched-render.js'),
  };

  const embed = getNode(workflow, 'Embed all chunks');
  embed.position = [2864, 0];
  embed.typeVersion = 4.4;
  embed.credentials = clone(sharedCredentials.llm);
  embed.parameters = {
    method: 'POST',
    url: 'http://192.168.66.112:4000/embeddings',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={{ {
  "model": "voyage-4-large",
  "input": $('Merge + render markdown').item.json.text_chunks
} }}`,
    options: { timeout: 120000 },
  };

  const points = getNode(workflow, 'Build Qdrant points');
  points.position = [3104, 0];
  points.parameters = {
    mode: 'runOnceForEachItem',
    jsCode: await readCode('watched-build-points.js'),
  };

  const qdrant = getNode(workflow, 'Qdrant upsert all chunks');
  qdrant.position = [3344, -80];
  qdrant.typeVersion = 4.4;
  qdrant.credentials = clone(sharedCredentials.qdrant);
  qdrant.parameters = {
    method: 'PUT',
    url: 'http://192.168.66.111:6333/collections/math_corpus/points',
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'qdrantApi',
    sendHeaders: true,
    headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '={{ { "points": $json.qdrant_points } }}',
    options: { timeout: 120000 },
  };

  const write = renameNode(workflow, 'Write Obsidian note', 'Nextcloud write paper');
  write.position = [3584, 0];
  write.typeVersion = 4.4;
  write.credentials = clone(sharedCredentials.nextcloud);
  write.parameters = {
    method: 'PUT',
    url: `=http://192.168.66.45:11005/remote.php/dav/files/rouvenjahnke/Workstation/Projects/maths/00_inbox/reader-pipeline/{{ $('Build Qdrant points').item.json.relative_path }}`,
    authentication: 'genericCredentialType',
    genericAuthType: 'httpBasicAuth',
    sendBody: true,
    contentType: 'raw',
    rawContentType: 'text/markdown',
    body: `={{ $('Build Qdrant points').item.json.content }}`,
    options: { batching: { batch: { batchSize: 1 } } },
  };

  const insert = renameNode(workflow, 'Postgres INSERT arxiv + article', 'Postgres insert paper');
  insert.position = [3824, 0];
  insert.typeVersion = 2.6;
  insert.credentials = clone(sharedCredentials.postgres);
  insert.parameters = {
    operation: 'executeQuery',
    query: `INSERT INTO arxiv_papers (
  semantic_scholar_paper_id, arxiv_id, doi,
  primary_category, all_categories, msc_codes,
  title, authors, abstract, published_at, updated_at, pdf_url, html_url,
  matched_categories, matched_authors, matched_keywords,
  inclusion_reason, score, content_score, source_priority, scoring_version, paper_status,
  qdrant_point_id, nextcloud_path
) VALUES (
  $1, $2, $3,
  $4, $5::text[], $6::text[],
  $7, $8::text[], $9, $10::timestamptz, $11::timestamptz, $12, $13,
  $14::text[], $15::text[], $16::text[],
  $17, $18::float, $19::float, $20::float, $21, 'inbox',
  $22::uuid, $23
) ON CONFLICT DO NOTHING;`,
    options: {
      queryReplacement: `={{ [
  $('Build Qdrant points').item.json.semantic_scholar_paper_id || null,
  $('Build Qdrant points').item.json.arxiv_id || null,
  $('Build Qdrant points').item.json.doi || null,
  $('Build Qdrant points').item.json.primary_category,
  $('Build Qdrant points').item.json.all_categories || [],
  $('Build Qdrant points').item.json.msc_codes || [],
  $('Build Qdrant points').item.json.title,
  $('Build Qdrant points').item.json.authors || [],
  $('Build Qdrant points').item.json.abstract,
  $('Build Qdrant points').item.json.published_at || null,
  $('Build Qdrant points').item.json.updated_at || null,
  $('Build Qdrant points').item.json.pdf_url || null,
  $('Build Qdrant points').item.json.html_url || null,
  $('Build Qdrant points').item.json.matched_categories || [],
  $('Build Qdrant points').item.json.matched_authors || [],
  $('Build Qdrant points').item.json.matched_keywords || [],
  $('Build Qdrant points').item.json.inclusion_reason,
  $('Build Qdrant points').item.json.score,
  $('Build Qdrant points').item.json.content_score,
  $('Build Qdrant points').item.json.source_priority,
  $('Build Qdrant points').item.json.scoring_version,
  $('Build Qdrant points').item.json.qdrant_point_id,
  $('Build Qdrant points').item.json.relative_path
] }}`,
    },
  };

  const stats = renameNode(workflow, 'Update state + get stats', 'Daily watched stats');
  stats.position = [4064, 0];
  stats.typeVersion = 2.6;
  stats.credentials = clone(sharedCredentials.postgres);
  stats.parameters = {
    operation: 'executeQuery',
    query: `SELECT COUNT(*) AS total_today
FROM arxiv_papers
WHERE fetched_at >= NOW() - INTERVAL '24 hours'
  AND inclusion_reason LIKE 'watched%';`,
    options: {},
  };

  const notifyIf = {
    id: 'b6447b64-7a13-4a4e-9acc-ae949afba462',
    name: 'Notify if requested',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.3,
    position: [4304, 0],
    parameters: {
      conditions: {
        options: {
          caseSensitive: true,
          leftValue: '',
          typeValidation: 'strict',
          version: 3,
        },
        conditions: [{
          leftValue: `={{ Boolean($('Build Qdrant points').item.json.notify) }}`,
          rightValue: true,
          operator: { type: 'boolean', operation: 'true', singleValue: true },
        }],
        combinator: 'and',
      },
      options: {},
    },
  };
  workflow.nodes.push(notifyIf);

  const telegram = renameNode(workflow, 'Telegram notify1', 'Telegram watched notification');
  telegram.position = [4544, 0];
  delete telegram.credentials;
  telegram.typeVersion = 4.4;
  telegram.parameters = {
    method: 'POST',
    url: '=https://api.telegram.org/bot{{$env.TELEGRAM_BOT_TOKEN}}/sendMessage',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={{ {
  "chat_id": $env.TELEGRAM_CHAT_ID,
  "text": "New watched paper\\n\\n" + $('Build Qdrant points').item.json.title + "\\n" + ($('Build Qdrant points').item.json.authors || []).join(', ') + "\\nScore: " + $('Build Qdrant points').item.json.score + "\\n" + $('Build Qdrant points').item.json.html_url
} }}`,
    options: {},
  };

  const schedule = getNode(workflow, 'Schedule Trigger');
  schedule.position = [0, 0];
  schedule.parameters = {
    rule: { interval: [{ field: 'cronExpression', expression: '15 6 * * *' }] },
  };

  workflow.connections = {
    'Schedule Trigger': { main: [[connection('Load watched targets')]] },
    'Load watched targets': { main: [[connection('Fetch watched papers')]] },
    'Fetch watched papers': { main: [[connection('Parse + flatten')]] },
    'Parse + flatten': { main: [[connection('Dedup check')]] },
    'Dedup check': { main: [[connection('Continue if new')]] },
    'Continue if new': { main: [[connection('Route full text')]] },
    'Route full text': {
      main: [
        [connection('Execute Command')],
        [connection('Execute Command1')],
        [connection('Execute Command2')],
        [connection('Use abstract')],
      ],
    },
    'Execute Command': { main: [[connection('Parse stdout')]] },
    'Execute Command1': { main: [[connection('Parse stdout')]] },
    'Execute Command2': { main: [[connection('Parse stdout')]] },
    'Use abstract': { main: [[connection('Parse stdout')]] },
    'Parse stdout': { main: [[connection('LLM enrich + content score')]] },
    'LLM enrich + content score': { main: [[connection('Merge + render markdown')]] },
    'Merge + render markdown': { main: [[connection('Embed all chunks')]] },
    'Embed all chunks': { main: [[connection('Build Qdrant points')]] },
    'Build Qdrant points': { main: [[connection('Qdrant upsert all chunks')]] },
    'Qdrant upsert all chunks': { main: [[connection('Nextcloud write paper')]] },
    'Nextcloud write paper': { main: [[connection('Postgres insert paper')]] },
    'Postgres insert paper': { main: [[connection('Daily watched stats')]] },
    'Daily watched stats': { main: [[connection('Notify if requested')]] },
    'Notify if requested': { main: [[connection('Telegram watched notification')], []] },
  };

  const output = importTemplate(workflow, 'Pipeline_Watched_Authors');
  assertSanitized(output);
  return output;
}

await fs.mkdir(outputDirectory, { recursive: true });
const [blogs, watched] = await Promise.all([
  buildBlogWorkflow(),
  buildWatchedWorkflow(),
]);

await Promise.all([
  fs.writeFile(path.join(outputDirectory, 'Pipeline_Math_AI_Blogs.json'), `${JSON.stringify(blogs, null, 2)}\n`),
  fs.writeFile(path.join(outputDirectory, 'Pipeline_Watched_Authors.json'), `${JSON.stringify(watched, null, 2)}\n`),
]);

console.log('Generated sanitized workflows:');
console.log('- n8n/Pipeline_Math_AI_Blogs.json');
console.log('- n8n/Pipeline_Watched_Authors.json');
