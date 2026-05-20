import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { errorMessage, jsonError } from '@/lib/api';
import { isAuthorized } from '@/lib/auth';
import { listArticleSummaries } from '@/lib/nextcloud';

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) return jsonError('Nicht autorisiert', 401);

  try {
    const articles = await listArticleSummaries();
    return NextResponse.json(articles);
  } catch (error) {
    return jsonError(errorMessage(error));
  }
}
