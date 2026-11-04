import { NextResponse, type NextRequest } from 'next/server';
import { SKIN_COOKIE, parseSkin } from '@/lib/skin';

/**
 * `?skin=rpg|pixel|default` on any page sets the skin cookie and
 * redirects to the same URL without the parameter, so a test link can
 * be sent to a phone and the skin sticks for every page after it.
 */
export function middleware(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get('skin');
  if (requested === null) return NextResponse.next();

  const skin = parseSkin(requested);
  const clean = request.nextUrl.clone();
  clean.searchParams.delete('skin');

  const response = NextResponse.redirect(clean);
  if (skin === 'default') {
    response.cookies.delete(SKIN_COOKIE);
  } else {
    response.cookies.set(SKIN_COOKIE, skin, {
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 90,
    });
  }
  return response;
}

export const config = {
  // Pages only — skip Next internals and static files.
  matcher: ['/((?!_next/|favicon\\.ico|.*\\.[a-zA-Z0-9]+$).*)'],
};
