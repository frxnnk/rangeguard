import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const API_KEY = process.env.DASHBOARD_API_KEY;

/** Routes that don't require auth */
const PUBLIC_ROUTES = ['/login', '/api/auth', '/api/bot-status'];

function isPublic(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(route + '/'));
}

export function middleware(request: NextRequest) {
  // No API key configured → dev mode, allow everything
  if (!API_KEY) return NextResponse.next();

  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  // API routes: check x-api-key header OR auth cookie
  if (pathname.startsWith('/api/')) {
    const headerKey = request.headers.get('x-api-key');
    const cookieKey = request.cookies.get('auth-token')?.value;

    if (headerKey === API_KEY || cookieKey === API_KEY) {
      return NextResponse.next();
    }

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Static assets + Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/icon.svg'
  ) {
    return NextResponse.next();
  }

  // Dashboard pages: check auth cookie
  const cookieKey = request.cookies.get('auth-token')?.value;
  if (cookieKey === API_KEY) {
    return NextResponse.next();
  }

  // Redirect to login
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
