import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { errorMessage, jsonError } from '@/lib/api';
import { isAuthorized } from '@/lib/auth';
import { listArticleSummaries } from '@/lib/nextcloud';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) return jsonError('Nicht autorisiert', 401);

  try {
    return NextResponse.json({ articles: await listArticleSummaries(), syncedAt: new Date().toISOString() });
  } catch (error) {
    return jsonError(errorMessage(error));
  }
}
