'use client';

import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import rehypePrism from 'rehype-prism-plus';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

interface HastNode {
  type?: unknown;
  tagName?: unknown;
  value?: unknown;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

const highlightedMathPattern = /==(\$\$[\s\S]*?\$\$|\$[^$\n][\s\S]*?\$)==/g;

function extractHighlightedMath(content: string): { content: string; highlightedMath: Set<string> } {
  const highlightedMath = new Set<string>();
  const cleaned = content.replace(highlightedMathPattern, (_, source: string) => {
    highlightedMath.add(normalizeMathSource(source));
    return source;
  });

  return { content: cleaned, highlightedMath };
}

function renderTextHighlights(content: string): string {
  return content.replace(/==([\s\S]+?)==/g, '<mark>$1</mark>');
}

function rehypeMathSource() {
  return (tree: HastNode) => {
    visit(tree, (node) => {
      if (node.type !== 'element' || node.tagName !== 'code') return;
      const className = node.properties?.className;
      const classes = Array.isArray(className) ? className.filter((item): item is string => typeof item === 'string') : [];
      const isInlineMath = classes.includes('math-inline');
      const isDisplayMath = classes.includes('math-display');
      if (!isInlineMath && !isDisplayMath) return;

      const raw = node.children?.map((child) => (typeof child.value === 'string' ? child.value : '')).join('') ?? '';
      if (!raw.trim()) return;
      node.properties = {
        ...node.properties,
        dataMdSource: isDisplayMath ? `$$${raw}$$` : `$${raw}$`
      };
    });
  };
}

function rehypeKatexSource(highlightedMath: Set<string>) {
  return (tree: HastNode) => {
    visit(tree, (node) => {
      if (node.type !== 'element') return;
      const className = node.properties?.className;
      const classes = Array.isArray(className) ? className.filter((item): item is string => typeof item === 'string') : [];
      const isKatex = classes.includes('katex');
      const isKatexDisplay = classes.includes('katex-display');
      if (!isKatex && !isKatexDisplay) return;

      const annotation = findTexAnnotation(node)?.trim();
      if (!annotation) return;
      const source = isKatexDisplay ? `$$${annotation}$$` : `$${annotation}$`;
      const normalizedSource = normalizeMathSource(source);

      node.properties = {
        ...node.properties,
        className: highlightedMath.has(normalizedSource) ? [...classes, 'reader-math-highlight'] : classes,
        dataMdSource: source
      };
    });
  };
}

function normalizeMathSource(value: string): string {
  return value.replace(/\s+/g, '');
}

function findTexAnnotation(node: HastNode): string | null {
  if (node.type === 'element' && node.tagName === 'annotation' && node.properties?.encoding === 'application/x-tex') {
    return node.children?.map((child) => (typeof child.value === 'string' ? child.value : '')).join('') ?? '';
  }

  for (const child of node.children ?? []) {
    const found = findTexAnnotation(child);
    if (found) return found;
  }

  return null;
}

function visit(node: HastNode, visitor: (node: HastNode) => void): void {
  visitor(node);
  for (const child of node.children ?? []) visit(child, visitor);
}

export type ReaderFontSize = 'S' | 'M' | 'L' | 'XL';

const proseSize: Record<ReaderFontSize, string> = {
  S: 'prose-sm',
  M: 'prose-base',
  L: 'prose-lg',
  XL: 'prose-xl'
};

export function MarkdownRenderer({ content, fontSize = 'M' }: { content: string; fontSize?: ReaderFontSize }): React.ReactElement {
  const prepared = extractHighlightedMath(content);
  const size = proseSize[fontSize] ?? proseSize.M;

  return (
    <article className={`reader-prose prose ${size} max-w-none dark:prose-invert prose-img:max-w-full prose-img:rounded-md prose-pre:rounded-md`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeMathSource, rehypeKatex, [rehypeKatexSource, prepared.highlightedMath], rehypePrism]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          img: ({ src, alt }) => <img src={src ?? ''} alt={alt ?? ''} loading="lazy" />
        }}
      >
        {renderTextHighlights(prepared.content)}
      </ReactMarkdown>
    </article>
  );
}
