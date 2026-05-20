'use client';

import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import rehypePrism from 'rehype-prism-plus';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

function renderHighlights(content: string): string {
  return content.replace(/==([\s\S]+?)==/g, '<mark>$1</mark>');
}

export function MarkdownRenderer({ content }: { content: string }): React.ReactElement {
  return (
    <article className="reader-prose prose prose-lg max-w-none dark:prose-invert prose-img:max-w-full prose-img:rounded-md prose-pre:rounded-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeKatex, rehypePrism]}
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
