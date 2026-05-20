import { NextResponse } from 'next/server';

export function jsonError(message: string, status = 500): NextResponse<{ error: string }> {
  return NextResponse.json({ error: message }, { status });
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unbekannter Fehler';
}
