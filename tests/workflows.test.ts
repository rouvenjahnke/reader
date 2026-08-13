import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

interface WorkflowNode {
  name: string;
  type: string;
  parameters: Record<string, unknown>;
}

interface WorkflowConnection {
  node: string;
}

interface Workflow {
  name: string;
  active: boolean;
  nodes: WorkflowNode[];
  connections: Record<string, { main: WorkflowConnection[][] }>;
}

const readWorkflow = (name: string): Workflow => JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'n8n', name), 'utf8'),
) as Workflow;

const node = (workflow: Workflow, name: string): WorkflowNode => {
  const match = workflow.nodes.find((candidate) => candidate.name === name);
  if (!match) throw new Error(`Missing node ${name}`);
  return match;
};

const allConnectionTargetsExist = (workflow: Workflow): boolean => {
  const names = new Set(workflow.nodes.map((item) => item.name));
  return Object.entries(workflow.connections).every(([source, group]) =>
    names.has(source) && group.main.flat().every((connection) => names.has(connection.node)),
  );
};

const unreachableNodes = (workflow: Workflow): string[] => {
  const start = workflow.nodes.filter((item) => item.type.includes('Trigger')).map((item) => item.name);
  const seen = new Set(start);
  const queue = [...start];
  while (queue.length > 0) {
    const source = queue.shift()!;
    const targets = workflow.connections[source]?.main.flat().map((item) => item.node) ?? [];
    for (const target of targets) {
      if (seen.has(target)) continue;
      seen.add(target);
      queue.push(target);
    }
  }
  return workflow.nodes.map((item) => item.name).filter((name) => !seen.has(name));
};

const missingParameterReferences = (workflow: Workflow): string[] => {
  const names = new Set(workflow.nodes.map((item) => item.name));
  const missing = new Set<string>();
  const expression = /\$\((['"])(.*?)\1\)/g;
  for (const workflowNode of workflow.nodes) {
    const parameters = JSON.stringify(workflowNode.parameters);
    for (const match of parameters.matchAll(expression)) {
      if (!names.has(match[2])) missing.add(`${workflowNode.name} -> ${match[2]}`);
    }
  }
  return [...missing];
};

describe('sanitized n8n templates', () => {
  const blogs = readWorkflow('Pipeline_Math_AI_Blogs.json');
  const watched = readWorkflow('Pipeline_Watched_Authors.json');

  it.each([blogs, watched])('ships $name inactive with a valid graph', (workflow) => {
    expect(workflow.active).toBe(false);
    expect(allConnectionTargetsExist(workflow)).toBe(true);
    expect(new Set(workflow.nodes.map((item) => item.name)).size).toBe(workflow.nodes.length);
    expect(unreachableNodes(workflow)).toEqual([]);
    expect(missingParameterReferences(workflow)).toEqual([]);
  });

  it.each([blogs, watched])('contains no embedded secrets or obsolete ranks in $name', (workflow) => {
    const serialized = JSON.stringify(workflow);
    expect(serialized).not.toMatch(/bot\d+:[A-Za-z0-9_-]+/);
    expect(serialized).not.toContain('X-Auth-Token');
    expect(serialized).not.toContain('"api-key"');
    expect(serialized).not.toContain('reader_priority');
    expect(serialized).not.toContain('composite_priority');
    expect(serialized).not.toContain('192.168.178.');
  });

  it('uses one lightly source-adjusted score for blogs without automatic pins', () => {
    const code = String(node(blogs, 'Combined score + filter1').parameters.jsCode);
    expect(code).toContain('CONTENT_WEIGHT = 0.85');
    expect(code).toContain('SOURCE_WEIGHT = 0.15');
    expect(code).toContain('accept: isTaoSource || score >= ACCEPTANCE_SCORE');
    expect(code).not.toContain('reader_pinned');
  });

  it('loads stable watched-author targets and writes a Paper inbox item', () => {
    const loadQuery = String(node(watched, 'Load watched targets').parameters.query);
    const renderCode = String(node(watched, 'Merge + render markdown').parameters.jsCode);
    const serialized = JSON.stringify(watched);

    expect(loadQuery).toContain('semantic_scholar_author_id');
    expect(serialized).toContain('api.semanticscholar.org/graph/v1/author/');
    expect(serialized).toContain('/paper/search/bulk');
    expect(serialized).toContain('SEMANTIC_SCHOLAR_API_KEY');
    expect(serialized).toContain('batchInterval');
    expect(serialized).not.toContain('miniflux');
    expect(renderCode).toContain('paper_status: inbox');
    expect(renderCode).toContain('math_preprints/');
    expect(renderCode).toContain('0.85 * contentScore + 0.15 * sourcePriority');
  });
});
