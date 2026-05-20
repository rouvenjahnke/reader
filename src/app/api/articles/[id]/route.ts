import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { errorMessage, jsonError } from '@/lib/api';
import { isAuthorized } from '@/lib/auth';
import { decodeArticleId } from '@/lib/ids';
import { getArticle } from '@/lib/nextcloud';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  if (!isAuthorized(request)) return jsonError('Nicht autorisiert', 401);

  try {
    const { id } = await context.params;
    const article = await getArticle(decodeArticleId(id));
    return NextResponse.json(article);
  } catch (error) {
    return jsonError(errorMessage(error));
  }
}
