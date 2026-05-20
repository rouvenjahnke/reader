import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { errorMessage, jsonError } from '@/lib/api';
import { isAuthorized } from '@/lib/auth';
import { addHighlight } from '@/lib/frontmatter';
import { decodeArticleId } from '@/lib/ids';
import { getArticle, getArticleRaw, putArticleRaw } from '@/lib/nextcloud';

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface HighlightBody {
  text?: string;
}

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  if (!isAuthorized(request)) return jsonError('Nicht autorisiert', 401);

  try {
    const { id } = await context.params;
    const body = (await request.json()) as HighlightBody;
    if (!body.text?.trim()) return jsonError('Kein Text markiert', 400);

    const path = decodeArticleId(id);
    const raw = await getArticleRaw(path);
    const updated = addHighlight(raw, body.text);
    await putArticleRaw(path, updated);
    const article = await getArticle(path);

    return NextResponse.json(article);
  } catch (error) {
    return jsonError(errorMessage(error), error instanceof Error && error.message.includes('nicht eindeutig') ? 409 : 500);
  }
}
