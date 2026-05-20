import type { NextRequest } from 'next/server';

export function isAuthorized(request: NextRequest): boolean {
  const token = process.env.READER_AUTH_TOKEN;
  if (!token) return true;
  return request.headers.get('authorization') === `Bearer ${token}`;
}
