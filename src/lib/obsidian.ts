/**
 * Build an obsidian://open URI for an article stored in the Nextcloud pipeline.
 *
 * `pipelinePath` is the pipeline folder relative to the vault root
 * (e.g. "00_inbox/reader-pipeline"). The article's vault-relative path is
 * derived from the WebDAV path segment after the pipeline folder name, so the
 * client never needs to know the server-side base path.
 */
export function buildObsidianUri(vault: string, pipelinePath: string, articlePath: string): string | null {
  const vaultName = vault.trim();
  if (!vaultName) return null;

  const cleanPipeline = pipelinePath.trim().replace(/^\/+|\/+$/g, '');
  const relative = relativeArticlePath(cleanPipeline, articlePath);
  const file = (cleanPipeline ? `${cleanPipeline}/${relative}` : relative).replace(/\.md$/i, '');

  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(file)}`;
}

function relativeArticlePath(pipelinePath: string, articlePath: string): string {
  const lastSegment = pipelinePath.split('/').filter(Boolean).pop();
  if (lastSegment) {
    const marker = `/${lastSegment}/`;
    const index = articlePath.indexOf(marker);
    if (index >= 0) return articlePath.slice(index + marker.length);
  }
  const segments = articlePath.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? articlePath;
}

export function slugifyHeading(text: string, taken: Set<string>): string {
  const base =
    text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'section';
  let slug = base;
  let counter = 1;
  while (taken.has(slug)) {
    slug = `${base}-${counter}`;
    counter += 1;
  }
  taken.add(slug);
  return slug;
}
