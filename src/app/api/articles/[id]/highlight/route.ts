import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { errorMessage, jsonError } from '@/lib/api';
import { isAuthorized } from '@/lib/auth';
import { addHighlight, removeHighlight } from '@/lib/frontmatter';
import { decodeArticleId } from '@/lib/ids';
import { getArticle, getArticleRaw, putArticleRaw } from '@/lib/nextcloud';

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface HighlightBody {
  text?: string;
  action?: 'add' | 'remove';
  occurrenceIndex?: number;
}

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  if (!isAuthorized(request)) return jsonError('Not authorized', 401);

  try {
    const { id } = await context.params;
    const body = (await request.json()) as HighlightBody;
    if (!body.text?.trim()) return jsonError('Selection is empty', 400);

    const action = body.action === 'remove' ? 'remove' : 'add';
    const occurrenceIndex = Number.isFinite(body.occurrenceIndex) ? Math.max(0, Math.floor(body.occurrenceIndex as number)) : 0;

    const path = decodeArticleId(id);
    const raw = await getArticleRaw(path);
    const updated =
      action === 'remove'
        ? removeHighlight(raw, body.text, { occurrenceIndex })
        : addHighlight(raw, body.text, { occurrenceIndex });
    if (updated !== raw) {
      await putArticleRaw(path, updated);
    }
    const article = await getArticle(path);

    return NextResponse.json(article);
  } catch (error) {
    const message = errorMessage(error);
    const status = error instanceof Error && /could not be located/i.test(error.message) ? 409 : 500;
    return jsonError(message, status);
  }
}
