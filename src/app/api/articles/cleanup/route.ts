import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { errorMessage, jsonError } from '@/lib/api';
import { isAuthorized } from '@/lib/auth';
import { deleteArticlesOlderThan } from '@/lib/nextcloud';

interface CleanupBody {
  olderThanDays?: unknown;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) return jsonError('Nicht autorisiert', 401);

  let body: CleanupBody;
  try {
    body = (await request.json()) as CleanupBody;
  } catch {
    return jsonError('Ungültiger JSON-Request', 400);
  }

  const olderThanDays = Number(body.olderThanDays);
  if (!Number.isInteger(olderThanDays) || olderThanDays < 1 || olderThanDays > 36_500) {
    return jsonError('Das Artikelalter muss eine ganze Zahl zwischen 1 und 36500 Tagen sein.', 400);
  }

  try {
    const result = await deleteArticlesOlderThan(olderThanDays);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(errorMessage(error));
  }
}
