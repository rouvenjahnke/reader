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

function renderHighlights(content: string): string {
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

function visit(node: HastNode, visitor: (node: HastNode) => void): void {
  visitor(node);
  for (const child of node.children ?? []) visit(child, visitor);
}

export function MarkdownRenderer({ content }: { content: string }): React.ReactElement {
  return (
    <article className="reader-prose prose prose-lg max-w-none dark:prose-invert prose-img:max-w-full prose-img:rounded-md prose-pre:rounded-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeMathSource, rehypeKatex, rehypePrism]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          img: ({ src, alt }) => <img src={src ?? ''} alt={alt ?? ''} loading="lazy" />
        }}
      >
        {renderHighlights(content)}
      </ReactMarkdown>
    </article>
  );
}
