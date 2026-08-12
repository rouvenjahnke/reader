#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import dotenv from 'dotenv';
import matter from 'gray-matter';
import pg from 'pg';
import { createClient } from 'webdav';

loadEnvironment();

const { Client } = pg;
const DEFAULT_WORKFLOW_NAME = 'Pipeline_Math_AI_Blogs';
const TAO_PATTERN = /(?:terry|terence)\s+tao|what'?s new|mathstodon:\s*tao/i;
const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

const workflow = await inspectWorkflow(args.workflow);
const miniflux = await inspectMiniflux(args, workflow.privateConfig);
const entries = filterEntries(miniflux.entries, args);
const entryIds = unique(args.entryIds.concat(entries.map((entry) => entry.id)));
const urls = unique((args.url ? [args.url] : []).concat(entries.map((entry) => entry.url).filter(Boolean)));

const [database, nextcloud, reader, n8n] = await Promise.all([
  inspectDatabase(args.feedId, entryIds, urls),
  inspectNextcloud(entryIds, urls),
  inspectReader(entryIds, urls),
  inspectN8n(entryIds, urls, workflow.result.workflowName || DEFAULT_WORKFLOW_NAME)
]);

const reconciled = reconcile(entries, args.feedId, database, nextcloud, reader, n8n);
const report = {
  generatedAt: new Date().toISOString(),
  readOnly: true,
  target: {
    feedId: args.feedId,
    entryIds: args.entryIds,
    url: args.url,
    title: args.title
  },
  checks: {
    workflow: workflow.result,
    miniflux: miniflux.result,
    database: database.result,
    nextcloud: nextcloud.result,
    reader: reader.result,
    n8n: n8n.result
  },
  entries: reconciled,
  findings: buildFindings(reconciled, { workflow, miniflux, database, nextcloud, reader, n8n })
};
report.summary = summarize(report);

const output = path.resolve(args.output);
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n', 'utf8');
printSummary(report, output);

function loadEnvironment() {
  const loaded = [];
  for (const [file, override] of [['.env', false], ['.env.debug', true]]) {
    const result = dotenv.config({ path: file, override, quiet: true });
    if (!result.error) loaded.push(file);
  }
  if (loaded.length > 0) console.log('Loaded environment: ' + loaded.join(', '));
  else console.log('No .env or .env.debug found; using process environment only.');
}

function parseArgs(values) {
  const result = {
    feedId: 65,
    entryIds: [],
    output: 'debug-output/terence-tao-report.json',
    workflow: 'Pipeline_Math_AI_Blogs (6).json',
    url: undefined,
    title: undefined,
    help: false
  };

  for (let index = 0; index < values.length; index += 1) {
    const option = values[index];
    if (option === '--help' || option === '-h') result.help = true;
    else if (option === '--feed-id') result.feedId = Number(requireValue(values, ++index, option));
    else if (option === '--entry-id') result.entryIds.push(requireValue(values, ++index, option));
    else if (option === '--url') result.url = requireValue(values, ++index, option);
    else if (option === '--title') result.title = requireValue(values, ++index, option);
    else if (option === '--workflow') result.workflow = requireValue(values, ++index, option);
    else if (option === '--output') result.output = requireValue(values, ++index, option);
    else throw new Error('Unknown option: ' + option);
  }

  if (!Number.isInteger(result.feedId) || result.feedId <= 0) {
    throw new Error('--feed-id must be a positive integer');
  }
  return result;
}

function requireValue(values, index, option) {
  const value = values[index];
  if (!value || value.startsWith('--')) throw new Error(option + ' requires a value');
  return value;
}

function printHelp() {
  console.log([
    'Terence Tao pipeline diagnostic (read-only)',
    '',
    'Usage:',
    '  npm run debug:tao',
    '  npm run debug:tao -- --entry-id 16451',
    '  npm run debug:tao -- --url https://terrytao.wordpress.com/...',
    '',
    'Options:',
    '  --feed-id <id>       Miniflux feed ID (default: 65)',
    '  --entry-id <id>      Restrict to an entry; repeatable',
    '  --url <url>          Restrict to one canonical article URL',
    '  --title <text>       Restrict by title substring',
    '  --workflow <path>    Local n8n export for static checks',
    '  --output <path>      JSON report path',
    '  --help               Show this help',
    '',
    'Environment:',
    '  DATABASE_URL         PostgreSQL connection; use a SELECT-only role',
    '  MINIFLUX_URL/TOKEN   Optional; local workflow export is the fallback',
    '  N8N_URL/API_KEY      Optional active-workflow/execution verification',
    '  N8N_WORKFLOW_ID      Optional explicit workflow ID',
    '  NEXTCLOUD_*          Reused from the Reader .env',
    '  READER_URL           Reader base URL (default: http://localhost:3000)',
    '  READER_AUTH_TOKEN    Optional Reader bearer token'
  ].join('\n'));
}

async function inspectWorkflow(file) {
  try {
    const data = JSON.parse(await fs.readFile(path.resolve(file), 'utf8'));
    const minifluxNode = data.nodes.find((node) => node.name.includes('Miniflux GET unread'));
    const scheduleNode = data.nodes.find((node) => node.type === 'n8n-nodes-base.scheduleTrigger');
    const lookupNode = data.nodes.find((node) => node.name.includes('Lookup blog source'));
    const filterNode = data.nodes.find((node) => node.name.includes('Combined filter'));
    const tokenNode = minifluxNode.parameters.headerParameters.parameters.find((item) => item.name === 'X-Auth-Token');
    return {
      result: {
        ok: true,
        file: path.resolve(file),
        workflowName: data.name,
        exportedActive: Boolean(data.active),
        schedule: scheduleNode?.parameters?.rule?.interval?.[0]?.expression,
        unreadLimit: minifluxNode.parameters.queryParameters.parameters.find((item) => item.name === 'limit')?.value,
        feed65LookupFallbackPresent: lookupNode?.parameters?.query?.includes('$1::int = 65') ?? false,
        taoAcceptanceOverridePresent: filterNode?.parameters?.jsCode?.includes('if (isTaoSource)') ?? false,
        warning: 'This checks the local export, not the workflow version active in n8n.'
      },
      privateConfig: {
        url: stripExpression(minifluxNode.parameters.url),
        token: stripExpression(tokenNode?.value)
      }
    };
  } catch (error) {
    return { result: { ok: false, file: path.resolve(file), error: safeError(error) }, privateConfig: {} };
  }
}

async function inspectMiniflux(options, workflowConfig) {
  const baseUrl = normalizeMinifluxUrl(process.env.MINIFLUX_URL || workflowConfig.url);
  const token = process.env.MINIFLUX_TOKEN || workflowConfig.token;
  if (!baseUrl || !token) {
    return {
      result: { ok: false, skipped: true, error: 'No Miniflux configuration found.' },
      entries: [],
      feeds: []
    };
  }

  try {
    const headers = { 'X-Auth-Token': token };
    const [feeds, response] = await Promise.all([
      fetchJson(baseUrl + '/feeds', headers),
      fetchJson(baseUrl + '/entries?feed_id=' + options.feedId + '&limit=1000&direction=desc', headers)
    ]);
    const entries = (response.entries || []).map((entry) => ({
      id: String(entry.id),
      feedId: Number(entry.feed_id),
      status: entry.status,
      title: entry.title,
      url: entry.url,
      author: entry.author,
      publishedAt: entry.published_at,
      createdAt: entry.created_at,
      changedAt: entry.changed_at
    }));
    const relevantFeeds = feeds.filter((feed) => Number(feed.id) === options.feedId || TAO_PATTERN.test([
      feed.title, feed.feed_url, feed.site_url
    ].join(' '))).map((feed) => ({
      id: feed.id,
      title: feed.title,
      feedUrl: feed.feed_url,
      siteUrl: feed.site_url,
      category: feed.category?.title,
      disabled: feed.disabled,
      parsingErrorCount: feed.parsing_error_count,
      parsingErrorMessage: feed.parsing_error_message,
      checkedAt: feed.checked_at
    }));
    return {
      result: {
        ok: true,
        baseUrl,
        feedId: options.feedId,
        feeds: relevantFeeds,
        entryCount: entries.length,
        unreadCount: entries.filter((entry) => entry.status === 'unread').length,
        entries
      },
      entries,
      feeds: relevantFeeds
    };
  } catch (error) {
    return { result: { ok: false, baseUrl, error: safeError(error) }, entries: [], feeds: [] };
  }
}

function filterEntries(entries, options) {
  const ids = new Set(options.entryIds.map(String));
  const wantedUrl = options.url ? normalizeUrl(options.url) : undefined;
  const title = options.title?.toLowerCase();
  return entries.filter((entry) => {
    if (ids.size > 0 && !ids.has(entry.id)) return false;
    if (wantedUrl && normalizeUrl(entry.url) !== wantedUrl) return false;
    if (title && !entry.title?.toLowerCase().includes(title)) return false;
    return true;
  });
}

async function inspectDatabase(feedId, entryIds, urls) {
  const connectionString = process.env.DATABASE_URL || process.env.MATH_DATABASE_URL;
  if (!connectionString) {
    return {
      result: {
        ok: false,
        skipped: true,
        error: 'DATABASE_URL is missing. Use a SELECT-only PostgreSQL role.'
      },
      sources: [],
      articles: []
    };
  }

  const client = new Client({
    connectionString,
    application_name: 'reader_tao_debug',
    connectionTimeoutMillis: 10000,
    query_timeout: 15000
  });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const identity = await client.query('SELECT current_database() AS database, current_user AS user, NOW() AS checked_at');
    const sources = await client.query([
      'SELECT id, name, miniflux_feed_id, active, category, priority, author_default, fetch_full_content',
      'FROM blog_sources',
      'WHERE miniflux_feed_id = $1::int',
      "OR LOWER(name) LIKE '%terry tao%'",
      "OR LOWER(name) LIKE '%terence tao%'",
      "OR LOWER(name) LIKE '%what''s new%'",
      'ORDER BY active DESC, name'
    ].join(' '), [feedId]);

    const columns = await client.query([
      'SELECT column_name FROM information_schema.columns',
      "WHERE table_schema = current_schema() AND table_name = 'math_articles'"
    ].join(' '));
    const available = new Set(columns.rows.map((row) => row.column_name));
    const selected = [
      'id', 'miniflux_entry_id', 'source_id', 'url', 'title', 'author', 'published_at',
      'fetched_at', 'score', 'reader_status', 'nextcloud_path', 'status', 'created_at', 'updated_at'
    ].filter((column) => available.has(column));
    const predicates = [];
    const values = [];
    if (entryIds.length > 0 && available.has('miniflux_entry_id')) {
      values.push(entryIds);
      predicates.push('miniflux_entry_id = ANY($' + values.length + '::bigint[])');
    }
    if (urls.length > 0 && available.has('url')) {
      values.push(urls);
      predicates.push('url = ANY($' + values.length + '::text[])');
    }
    if (available.has('title')) predicates.push("LOWER(COALESCE(title, '')) LIKE '%tao%'");
    if (available.has('author')) predicates.push("LOWER(COALESCE(author, '')) LIKE '%tao%'");
    const orderColumn = available.has('published_at') ? 'published_at' : selected[0];
    const articleQuery = [
      'SELECT ' + selected.map(quoteIdentifier).join(', '),
      'FROM math_articles',
      'WHERE ' + (predicates.join(' OR ') || 'FALSE'),
      'ORDER BY ' + quoteIdentifier(orderColumn) + ' DESC NULLS LAST',
      'LIMIT 250'
    ].join(' ');
    const articles = selected.length > 0 ? await client.query(articleQuery, values) : { rows: [] };

    const stateTable = await client.query("SELECT to_regclass(current_schema() || '.pipeline_state') AS table_name");
    const state = stateTable.rows[0]?.table_name
      ? await client.query("SELECT * FROM pipeline_state WHERE source = 'blogs' LIMIT 10")
      : { rows: [] };
    await client.query('ROLLBACK');
    return {
      result: {
        ok: true,
        identity: identity.rows[0],
        sourceRows: sources.rows,
        articleRows: articles.rows,
        pipelineState: state.rows,
        mathArticleColumns: Array.from(available).sort()
      },
      sources: sources.rows,
      articles: articles.rows
    };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    return { result: { ok: false, error: safeError(error) }, sources: [], articles: [] };
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function inspectNextcloud(entryIds, urls) {
  const basePath = process.env.NEXTCLOUD_BASE_PATH || '/Workstation/Projects/maths/00_inbox/reader-pipeline/';
  if (!process.env.NEXTCLOUD_URL || !process.env.NEXTCLOUD_USERNAME || !process.env.NEXTCLOUD_APP_PASSWORD) {
    return {
      result: { ok: false, skipped: true, basePath, error: 'NEXTCLOUD_* configuration is incomplete.' },
      files: []
    };
  }

  try {
    const client = createClient(process.env.NEXTCLOUD_URL, {
      username: process.env.NEXTCLOUD_USERNAME,
      password: process.env.NEXTCLOUD_APP_PASSWORD
    });
    const listing = await client.getDirectoryContents(basePath, { deep: true });
    const markdown = listing.filter((item) => item.type === 'file' && item.basename.endsWith('.md'));
    const candidates = markdown.filter((file) => {
      return TAO_PATTERN.test(file.basename) || entryIds.some((id) => file.basename.includes('-' + id + '-'));
    });
    const files = await mapWithConcurrency(candidates, 5, async (file) => {
      try {
        const raw = await client.getFileContents(file.filename, { format: 'text' });
        const text = typeof raw === 'string' ? raw : raw.toString();
        const parsed = matter(text);
        return {
          path: file.filename,
          basename: file.basename,
          size: file.size,
          lastModified: file.lastmod,
          title: parsed.data.title,
          source: parsed.data.source,
          author: parsed.data.author,
          url: parsed.data.url,
          fetched: parsed.data.fetched,
          published: parsed.data.published,
          readerStatus: parsed.data.reader_status,
          matchingEntryIds: entryIds.filter((id) => file.basename.includes('-' + id + '-') || text.includes(id)),
          matchingUrls: urls.filter((url) => text.includes(url))
        };
      } catch (error) {
        return {
          path: file.filename,
          basename: file.basename,
          error: safeError(error),
          matchingEntryIds: [],
          matchingUrls: []
        };
      }
    });
    const countsByFolder = {};
    for (const file of markdown) {
      const relative = relativeToBase(file.filename, basePath);
      const folder = relative.includes('/') ? relative.split('/')[0] : '(root)';
      countsByFolder[folder] = (countsByFolder[folder] || 0) + 1;
    }
    return {
      result: {
        ok: true,
        basePath,
        markdownCount: markdown.length,
        countsByFolder,
        candidateCount: files.length,
        candidateFiles: files
      },
      files
    };
  } catch (error) {
    return { result: { ok: false, basePath, error: safeError(error) }, files: [] };
  }
}

async function inspectReader(entryIds, urls) {
  const baseUrl = (process.env.READER_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const headers = process.env.READER_AUTH_TOKEN
    ? { authorization: 'Bearer ' + process.env.READER_AUTH_TOKEN }
    : {};
  try {
    const articles = await fetchJson(baseUrl + '/api/articles', headers);
    if (!Array.isArray(articles)) throw new Error('Reader API did not return an array');
    const candidates = articles.filter((article) => {
      const frontmatter = article.frontmatter || {};
      const haystack = [
        article.path, article.pipelineRelativePath, frontmatter.title,
        frontmatter.source, frontmatter.author
      ].join(' ');
      return TAO_PATTERN.test(haystack)
        || entryIds.some((id) => haystack.includes(id))
        || urls.some((url) => sameUrl(frontmatter.url, url));
    }).map((article) => ({
      id: article.id,
      path: article.path,
      pipelineRelativePath: article.pipelineRelativePath,
      pipelineFolder: article.pipelineFolder,
      title: article.frontmatter?.title,
      source: article.frontmatter?.source,
      author: article.frontmatter?.author,
      url: article.frontmatter?.url,
      readerStatus: article.frontmatter?.reader_status,
      fetched: article.frontmatter?.fetched,
      published: article.frontmatter?.published
    }));
    return {
      result: {
        ok: true,
        baseUrl,
        articleCount: articles.length,
        candidateCount: candidates.length,
        candidates
      },
      articles: candidates
    };
  } catch (error) {
    return {
      result: {
        ok: false,
        baseUrl,
        error: safeError(error),
        hint: 'Start npm run dev or set READER_URL to the deployed Reader.'
      },
      articles: []
    };
  }
}

async function inspectN8n(entryIds, urls, workflowName) {
  const baseUrl = process.env.N8N_URL?.replace(/\/+$/, '');
  const apiKey = process.env.N8N_API_KEY;
  if (!baseUrl || !apiKey) {
    return {
      result: {
        ok: false,
        skipped: true,
        error: 'N8N_URL and N8N_API_KEY are not configured.',
        hint: 'Configure them to compare the local export with the active workflow and execution data.'
      },
      executions: []
    };
  }

  try {
    const headers = { 'X-N8N-API-KEY': apiKey };
    let workflowId = process.env.N8N_WORKFLOW_ID;
    if (!workflowId) {
      const workflowsResponse = await fetchJson(baseUrl + '/api/v1/workflows?limit=100', headers);
      const workflows = workflowsResponse.data || workflowsResponse;
      workflowId = workflows.find((item) => item.name === workflowName)?.id;
    }
    if (!workflowId) throw new Error('Active n8n workflow not found by name: ' + workflowName);

    const [liveWorkflow, executionsResponse] = await Promise.all([
      fetchJson(baseUrl + '/api/v1/workflows/' + encodeURIComponent(workflowId), headers),
      fetchJson(baseUrl + '/api/v1/executions?workflowId=' + encodeURIComponent(workflowId) + '&includeData=true&limit=50', headers)
    ]);
    const executions = (executionsResponse.data || executionsResponse).filter((execution) => {
      const raw = JSON.stringify(execution);
      return entryIds.some((id) => raw.includes(id)) || urls.some((url) => raw.includes(url));
    }).map(summarizeExecution);
    const minifluxNode = liveWorkflow.nodes?.find((node) => node.name?.includes('Miniflux GET unread'));
    const scheduleNode = liveWorkflow.nodes?.find((node) => node.type === 'n8n-nodes-base.scheduleTrigger');
    const lookupNode = liveWorkflow.nodes?.find((node) => node.name?.includes('Lookup blog source'));
    const filterNode = liveWorkflow.nodes?.find((node) => node.name?.includes('Combined filter'));

    return {
      result: {
        ok: true,
        baseUrl,
        workflow: {
          id: String(liveWorkflow.id),
          name: liveWorkflow.name,
          active: liveWorkflow.active,
          updatedAt: liveWorkflow.updatedAt,
          schedule: scheduleNode?.parameters?.rule?.interval?.[0]?.expression,
          unreadLimit: minifluxNode?.parameters?.queryParameters?.parameters?.find((item) => item.name === 'limit')?.value,
          feed65LookupFallbackPresent: lookupNode?.parameters?.query?.includes('$1::int = 65') ?? false,
          taoAcceptanceOverridePresent: filterNode?.parameters?.jsCode?.includes('if (isTaoSource)') ?? false
        },
        searchedExecutionCount: (executionsResponse.data || executionsResponse).length,
        matchingExecutionCount: executions.length,
        executions: executions.map(publicExecution)
      },
      executions
    };
  } catch (error) {
    return { result: { ok: false, baseUrl, error: safeError(error) }, executions: [] };
  }
}

function summarizeExecution(execution) {
  const runData = execution.data?.resultData?.runData || {};
  const failedNodes = [];
  for (const [nodeName, runs] of Object.entries(runData)) {
    for (const run of runs || []) {
      if (run.error) failedNodes.push({ node: nodeName, error: safeError(run.error.message || run.error) });
    }
  }
  const raw = JSON.stringify(execution);
  return {
    id: String(execution.id),
    status: execution.status,
    mode: execution.mode,
    startedAt: execution.startedAt,
    stoppedAt: execution.stoppedAt,
    finished: execution.finished,
    lastNodeExecuted: execution.data?.resultData?.lastNodeExecuted,
    topLevelError: execution.data?.resultData?.error ? safeError(execution.data.resultData.error.message || execution.data.resultData.error) : undefined,
    failedNodes,
    executedNodes: Object.keys(runData),
    matchingEntryIds: [],
    matchingUrls: [],
    _searchText: raw
  };
}

function publicExecution(execution) {
  const { _searchText, ...result } = execution;
  return result;
}

function reconcile(entries, feedId, database, nextcloud, reader, n8n) {
  const exactSource = database.sources.some((source) => {
    return Number(source.miniflux_feed_id) === Number(feedId) && source.active !== false;
  });
  const fallbackSource = database.sources.some((source) => {
    return TAO_PATTERN.test(source.name || '') && source.active !== false;
  });

  return entries.map((entry) => {
    const databaseRows = database.articles.filter((article) => {
      return String(article.miniflux_entry_id || '') === entry.id || sameUrl(article.url, entry.url);
    });
    const nextcloudFiles = nextcloud.files.filter((file) => {
      return file.matchingEntryIds?.includes(entry.id)
        || file.matchingUrls?.some((url) => sameUrl(url, entry.url))
        || sameUrl(file.url, entry.url);
    });
    const readerArticles = reader.articles.filter((article) => {
      return article.pipelineRelativePath?.includes('-' + entry.id + '-') || sameUrl(article.url, entry.url);
    });
    const n8nExecutions = n8n.executions.filter((execution) => {
      return execution._searchText.includes(entry.id) || execution._searchText.includes(entry.url);
    }).map(publicExecution);
    const stage = determineStage({
      entry, n8n,
      database,
      nextcloud,
      reader,
      exactSource,
      fallbackSource,
      databaseRows,
      nextcloudFiles,
      readerArticles,
      n8nExecutions
    });
    return { ...entry, stage, databaseRows, nextcloudFiles, readerArticles, n8nExecutions };
  });
}

function determineStage(context) {
  const {
    entry, database, nextcloud, reader, n8n, exactSource, fallbackSource,
    databaseRows, nextcloudFiles, readerArticles, n8nExecutions
  } = context;
  if (database.result.ok && !exactSource && !fallbackSource) return 'SOURCE_NOT_REGISTERED';
  if (database.result.ok && !exactSource && fallbackSource && databaseRows.length === 0 && nextcloudFiles.length === 0) {
    return 'SOURCE_ID_STALE_WORKFLOW_FALLBACK_REQUIRED';
  }
  if (nextcloudFiles.length > 0 && databaseRows.length === 0) return 'NEXTCLOUD_FILE_WITHOUT_DATABASE_ROW';
  if (databaseRows.length > 0 && nextcloud.result.ok && nextcloudFiles.length === 0) {
    return 'DATABASE_ROW_WITHOUT_NEXTCLOUD_FILE';
  }
  if (nextcloudFiles.length > 0 && reader.result.ok && readerArticles.length === 0) {
    return 'NEXTCLOUD_FILE_NOT_IN_READER_API';
  }
  if (nextcloudFiles.length > 0 && readerArticles.length > 0) return 'OK';
  if (nextcloudFiles.length > 0) return 'NEXTCLOUD_PRESENT_READER_NOT_CHECKED';
  if (n8nExecutions.some((execution) => execution.status === 'error' || execution.status === 'crashed' || execution.failedNodes.length > 0)) {
    return 'N8N_EXECUTION_FAILED';
  }
  if (n8nExecutions.some((execution) => execution.status === 'success' || execution.finished === true)) {
    return 'N8N_FINISHED_WITHOUT_ARTIFACT';
  }
  if (n8n.result.ok && n8nExecutions.length === 0) return 'NO_N8N_EXECUTION_FOR_ENTRY';
  if (entry.status === 'read' && databaseRows.length === 0) return 'MARKED_READ_WITHOUT_ARTIFACT';
  if (entry.status === 'unread' && databaseRows.length === 0) {
    return database.result.ok ? 'WAITING_OR_WORKFLOW_FAILED_BEFORE_NEXTCLOUD' : 'DATABASE_NOT_CHECKED';
  }
  if (!database.result.ok) return 'DATABASE_NOT_CHECKED';
  return 'UNKNOWN';
}

function buildFindings(entries, checks) {
  const findings = [];
  for (const [name, check] of Object.entries(checks)) {
    if (check.result.ok) continue;
    findings.push({
      severity: name === 'reader' ? 'info' : 'warning',
      code: name.toUpperCase() + '_NOT_CHECKED',
      evidence: check.result.error,
      recommendation: missingCheckRecommendation(name)
    });
  }
  const stages = countStages(entries);
  for (const [stage, count] of Object.entries(stages)) {
    if (stage === 'OK') continue;
    if (findings.some((finding) => finding.code === stage)) continue;
    findings.push({
      severity: ['SOURCE_NOT_REGISTERED', 'MARKED_READ_WITHOUT_ARTIFACT'].includes(stage) ? 'error' : 'warning',
      code: stage,
      evidence: String(count) + ' matching Miniflux entries at this stage.',
      recommendation: stageRecommendation(stage)
    });
  }
  return findings;
}

function missingCheckRecommendation(name) {
  const values = {
    workflow: 'Keep the local workflow export available or pass --workflow.',
    miniflux: 'Set MINIFLUX_URL and MINIFLUX_TOKEN or keep the local workflow export.',
    database: 'Set DATABASE_URL to a SELECT-only PostgreSQL connection.',
    nextcloud: 'Verify NEXTCLOUD_* in .env.',
    reader: 'Start npm run dev or set READER_URL.',
    n8n: 'Set N8N_URL and N8N_API_KEY to inspect the active workflow and matching executions.'
  };
  return values[name];
}

function stageRecommendation(stage) {
  const values = {
    SOURCE_NOT_REGISTERED: 'Add or activate the Tao row in blog_sources and set miniflux_feed_id to the live feed ID.',
    SOURCE_ID_STALE_WORKFLOW_FALLBACK_REQUIRED: 'Update blog_sources.miniflux_feed_id and verify the corrected export is active in n8n.',
    WAITING_OR_WORKFLOW_FAILED_BEFORE_NEXTCLOUD: 'Inspect the latest n8n execution from Lookup blog source through Nextcloud Write File and run it manually once.',
    MARKED_READ_WITHOUT_ARTIFACT: 'Inspect the rejected branch, then reset the Miniflux entry to unread before retrying.',
    NEXTCLOUD_FILE_WITHOUT_DATABASE_ROW: 'Inspect Postgres INSERT1 for a constraint or type error.',
    DATABASE_ROW_WITHOUT_NEXTCLOUD_FILE: 'Check nextcloud_path and whether the WebDAV file was moved or deleted.',
    NEXTCLOUD_FILE_NOT_IN_READER_API: 'Check Markdown frontmatter parsing, Reader API logs, and NEXTCLOUD_BASE_PATH.',
    NEXTCLOUD_PRESENT_READER_NOT_CHECKED: 'Start the Reader API and rerun the diagnostic.',
    N8N_EXECUTION_FAILED: 'Open the reported n8n execution and inspect its failed node and input pairing.',
    N8N_FINISHED_WITHOUT_ARTIFACT: 'Inspect the reported successful execution branches; it completed without a matching DB row or WebDAV file.',
    NO_N8N_EXECUTION_FOR_ENTRY: 'Verify the active schedule/limit and run the active workflow manually for the unread entry.',
    DATABASE_NOT_CHECKED: 'Configure DATABASE_URL before drawing a conclusion.',
    UNKNOWN: 'Inspect the raw check sections in the JSON report.'
  };
  return values[stage] || values.UNKNOWN;
}

function summarize(value) {
  const checksOk = Object.fromEntries(Object.entries(value.checks).map(([name, check]) => {
    return [name, Boolean(check.ok)];
  }));
  const stages = countStages(value.entries);
  const severity = value.findings.some((item) => item.severity === 'error')
    ? 'error'
    : value.findings.some((item) => item.severity === 'warning') ? 'warning' : 'info';
  return {
    matchingMinifluxEntries: value.entries.length,
    checksOk,
    stages,
    highestSeverity: severity
  };
}

function countStages(entries) {
  const stages = {};
  for (const entry of entries) stages[entry.stage] = (stages[entry.stage] || 0) + 1;
  return stages;
}

function printSummary(value, output) {
  console.log('Terence Tao pipeline diagnostic');
  console.log('Report: ' + output);
  console.log('Entries: ' + value.summary.matchingMinifluxEntries);
  console.log('Checks: ' + Object.entries(value.summary.checksOk).map(([name, ok]) => {
    return name + '=' + (ok ? 'ok' : 'failed/skipped');
  }).join(', '));
  console.log('Stages: ' + (Object.entries(value.summary.stages).map(([stage, count]) => {
    return stage + '=' + count;
  }).join(', ') || 'none'));
  for (const item of value.findings) {
    console.log('[' + item.severity.toUpperCase() + '] ' + item.code + ': ' + item.recommendation);
  }
}

async function fetchJson(url, headers) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('HTTP ' + response.status + ' from ' + new URL(url).origin);
  return response.json();
}

async function mapWithConcurrency(items, limit, fn) {
  const result = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      result[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return result;
}

function normalizeMinifluxUrl(value) {
  if (!value) return undefined;
  const cleaned = stripExpression(value).replace(/\/+$/, '');
  if (cleaned.endsWith('/v1/entries')) return cleaned.slice(0, -'/entries'.length);
  if (cleaned.endsWith('/v1')) return cleaned;
  return cleaned + '/v1';
}

function normalizeUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value).trim());
    url.hash = '';
    for (const key of Array.from(url.searchParams.keys())) {
      if (key.startsWith('utm_') || ['fbclid', 'gclid', 'ref'].includes(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.host.toLowerCase() + (url.pathname.replace(/\/+$/, '') || '/') + url.search;
  } catch {
    return String(value).trim().toLowerCase();
  }
}

function sameUrl(left, right) {
  return Boolean(left && right && normalizeUrl(left) === normalizeUrl(right));
}

function relativeToBase(filename, basePath) {
  const base = '/' + basePath.split('/').filter(Boolean).join('/');
  const file = '/' + filename.split('/').filter(Boolean).join('/');
  return file.startsWith(base + '/') ? file.slice(base.length + 1) : file.replace(/^\/+/, '');
}

function quoteIdentifier(value) {
  return '"' + value.replaceAll('"', '""') + '"';
}

function stripExpression(value) {
  return typeof value === 'string' ? value.replace(/^=/, '') : undefined;
}

function unique(values) {
  return Array.from(new Set(values.map(String).filter(Boolean)));
}

function safeError(error) {
  let message = error instanceof Error ? error.message : String(error);
  const secrets = [
    process.env.DATABASE_URL,
    process.env.MATH_DATABASE_URL,
    process.env.MINIFLUX_TOKEN,
    process.env.N8N_API_KEY,
    process.env.NEXTCLOUD_APP_PASSWORD,
    process.env.READER_AUTH_TOKEN
  ].filter(Boolean);
  for (const secret of secrets) message = message.replaceAll(secret, '<redacted>');
  return message;
}
