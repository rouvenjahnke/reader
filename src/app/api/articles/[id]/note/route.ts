import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { errorMessage, jsonError } from '@/lib/api';
import { isAuthorized } from '@/lib/auth';
import { setNote } from '@/lib/frontmatter';
import { decodeArticleId } from '@/lib/ids';
import { getArticle, getArticleRaw, putArticleRaw } from '@/lib/nextcloud';

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface NoteBody {
  note?: string;
}

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  if (!isAuthorized(request)) return jsonError('Nicht autorisiert', 401);

  try {
    const { id } = await context.params;
    const body = (await request.json()) as NoteBody;
    if (typeof body.note !== 'string') {
      return jsonError('Ungültige Notiz', 400);
    }

    const path = decodeArticleId(id);
    const raw = await getArticleRaw(path);
    const updated = setNote(raw, body.note);
    await putArticleRaw(path, updated);
    const article = await getArticle(path);

    return NextResponse.json(article);
  } catch (error) {
    return jsonError(errorMessage(error));
  }
}
