import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { errorMessage, jsonError } from '@/lib/api';
import { isAuthorized } from '@/lib/auth';
import { setPinned } from '@/lib/frontmatter';
import { decodeArticleId } from '@/lib/ids';
import { getArticle, getArticleRaw, putArticleRaw } from '@/lib/nextcloud';

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface PinBody {
  pinned?: boolean;
  by?: string;
}

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  if (!isAuthorized(request)) return jsonError('Not authorized', 401);

  try {
    const { id } = await context.params;
    const body = (await request.json()) as PinBody;
    if (typeof body.pinned !== 'boolean') return jsonError('Invalid pin state', 400);

    const by = typeof body.by === 'string' ? body.by.trim().slice(0, 64) : 'reader';
    const path = decodeArticleId(id);
    const raw = await getArticleRaw(path);
    await putArticleRaw(path, setPinned(raw, body.pinned, by || 'reader'));
    return NextResponse.json(await getArticle(path));
  } catch (error) {
    return jsonError(errorMessage(error));
  }
}
