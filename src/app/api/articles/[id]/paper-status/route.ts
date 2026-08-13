import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { errorMessage, jsonError } from '@/lib/api';
import { isAuthorized } from '@/lib/auth';
import { setPaperStatus } from '@/lib/frontmatter';
import { decodeArticleId } from '@/lib/ids';
import { getArticle, getArticleRaw, putArticleRaw } from '@/lib/nextcloud';
import type { PaperStatus } from '@/types/article';

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface StatusBody {
  status?: PaperStatus;
}

const validStatuses = new Set<PaperStatus>(['inbox', 'skimmed', 'reading', 'reference', 'dismissed']);

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  if (!isAuthorized(request)) return jsonError('Not authorized', 401);

  try {
    const { id } = await context.params;
    const body = (await request.json()) as StatusBody;
    if (!body.status || !validStatuses.has(body.status)) return jsonError('Invalid paper status', 400);

    const path = decodeArticleId(id);
    const current = await getArticle(path);
    if (current.collection !== 'papers') return jsonError('Paper status is only available for papers', 409);

    const raw = await getArticleRaw(path);
    await putArticleRaw(path, setPaperStatus(raw, body.status));
    return NextResponse.json(await getArticle(path));
  } catch (error) {
    return jsonError(errorMessage(error));
  }
}
