import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Only redirect the root path
  if (request.nextUrl.pathname === '/') {
    // Create a redirect to /patches
    return NextResponse.redirect(new URL('/patches', request.url));
  }
}

// See: https://nextjs.org/docs/app/building-your-application/routing/middleware#matcher
export const config = {
  matcher: '/',
};