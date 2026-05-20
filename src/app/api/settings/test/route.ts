import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { errorMessage, jsonError } from '@/lib/api';
import { isAuthorized } from '@/lib/auth';
import { testConnection } from '@/lib/nextcloud';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) return jsonError('Nicht autorisiert', 401);

  try {
    const result = await testConnection();
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(errorMessage(error));
  }
}
