import { NextResponse } from 'next/server';

const LOCALES = ['en', 'ar'];

/** Every page lives under /en or /ar. Bare paths go to the visitor's preferred language. */
export function middleware(request) {
  const { pathname } = request.nextUrl;
  if (LOCALES.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`))) return NextResponse.next();
  const saved = request.cookies.get('locale')?.value;
  const browserArabic = (request.headers.get('accept-language') || '').toLowerCase().startsWith('ar');
  const preferred = LOCALES.includes(saved) ? saved : (browserArabic ? 'ar' : 'en');
  const url = request.nextUrl.clone();
  url.pathname = `/${preferred}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!api|_next|favicon.ico|.*\\..*).*)'] };
