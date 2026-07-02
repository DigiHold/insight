import { NextResponse } from 'next/server';

// Adds the noindex header to every response. The tool must never be indexed.
export function middleware() {
  const res = NextResponse.next();
  res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  return res;
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
};
