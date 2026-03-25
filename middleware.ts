import { next, rewrite } from '@vercel/edge';

/**
 * Every `/t/:invite` request is rewritten to the tournaments API with `og=1`.
 * That handler merges tournament-specific OG tags into the real `index.html` shell.
 * WhatsApp and others often use a normal browser User-Agent, so we cannot rely on bot UAs only.
 */
export const config = {
  matcher: ['/t/:path*'],
};

export default function middleware(request: Request): Response {
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/t\/([^/]+)\/?$/);
  if (!m?.[1]) {
    return next();
  }

  const token = decodeURIComponent(m[1]);
  const dest = new URL('/api/tournaments', url.origin);
  dest.searchParams.set('inviteLink', token);
  dest.searchParams.set('og', '1');
  url.searchParams.forEach((value, key) => {
    if (key !== 'inviteLink') {
      dest.searchParams.set(key, value);
    }
  });
  return rewrite(dest);
}
