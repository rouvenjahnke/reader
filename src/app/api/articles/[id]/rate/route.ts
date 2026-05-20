import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { errorMessage, jsonError } from '@/lib/api';
import { isAuthorized } from '@/lib/auth';
import { setRating } from '@/lib/frontmatter';
import { decodeArticleId } from '@/lib/ids';
import { getArticle, getArticleRaw, putArticleRaw } from '@/lib/nextcloud';
import type { ReaderStatus } from '@/types/article';

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface RateBody {
  status?: ReaderStatus;
}

const validStatuses = new Set<Exclude<ReaderStatus, 'unrated'>>(['irrelevant', 'relevant', 'high_relevant']);

function isRatingStatus(value: unknown): value is Exclude<ReaderStatus, 'unrated'> {
  return typeof value === 'string' && validStatuses.has(value as Exclude<ReaderStatus, 'unrated'>);
}

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  if (!isAuthorized(request)) return jsonError('Nicht autorisiert', 401);

  try {
    const { id } = await context.params;
    const body = (await request.json()) as RateBody;
    if (!isRatingStatus(body.status)) {
      return jsonError('Ungültiges Rating', 400);
    }

    const path = decodeArticleId(id);
    const raw = await getArticleRaw(path);
    const updated = setRating(raw, body.status);
    await putArticleRaw(path, updated);
    const article = await getArticle(path);

    return NextResponse.json(article);
  } catch (error) {
    return jsonError(errorMessage(error));
  }
}
