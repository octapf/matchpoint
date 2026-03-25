import type { Document } from 'mongodb';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function siteOrigin(): string {
  return (process.env.EXPO_PUBLIC_INVITE_BASE_URL || 'https://matchpoint.miralab.ar').replace(/\/$/, '');
}

export type OgLang = 'en' | 'es' | 'it';

export function parseOgLang(q: string | string[] | undefined): OgLang {
  const raw = typeof q === 'string' ? q : Array.isArray(q) ? q[0] : '';
  if (raw === 'es' || raw === 'it' || raw === 'en') return raw;
  return 'en';
}

function copy(lang: OgLang) {
  const c = {
    en: {
      suffix: ' · Matchpoint',
      fallbackDesc: 'Join tournaments, form teams, and compete. By Miralab.',
      unknownTournament: 'Matchpoint - Beach Volleyball Tournaments',
    },
    es: {
      suffix: ' · Matchpoint',
      fallbackDesc: 'Únete a torneos, forma equipos y compite. Por Miralab.',
      unknownTournament: 'Matchpoint - Torneos de vóley playa',
    },
    it: {
      suffix: ' · Matchpoint',
      fallbackDesc: 'Partecipa ai tornei, forma squadre e gareggia. Di Miralab.',
      unknownTournament: 'Matchpoint - Tornei di beach volley',
    },
  };
  return c[lang];
}

function formatDate(iso: string | undefined, lang: OgLang): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const locale = lang === 'es' ? 'es' : lang === 'it' ? 'it' : 'en';
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(d);
  } catch {
    return '';
  }
}

export type InviteOgContent = {
  title: string;
  description: string;
  canonicalUrl: string;
};

/** Shared title/description for invite OG (minimal HTML vs index merge). */
export function getInviteOgContent(doc: Document | null, token: string, lang: OgLang): InviteOgContent {
  const t = copy(lang);
  const origin = siteOrigin();
  const canonicalUrl =
    lang === 'en'
      ? `${origin}/t/${encodeURIComponent(token)}`
      : `${origin}/t/${encodeURIComponent(token)}?lang=${lang}`;

  if (!doc) {
    return {
      title: t.unknownTournament,
      description: t.fallbackDesc,
      canonicalUrl,
    };
  }

  const name = String(doc.name ?? 'Tournament');
  const location = String(doc.location ?? '').trim();
  const start = (doc.startDate ?? doc.date) as string | undefined;
  const end = doc.endDate as string | undefined;
  const descBody = String(doc.description ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 200);

  const dateStr =
    end && end !== start
      ? `${formatDate(start, lang)} – ${formatDate(end, lang)}`
      : formatDate(start, lang);

  const detailParts = [descBody, location, dateStr].filter(Boolean);
  const description = detailParts.length > 0 ? detailParts.join(' · ') : t.fallbackDesc;
  const title = `${name}${t.suffix}`;

  return { title, description, canonicalUrl };
}

/** Replace OG/twitter meta + title in exported index.html so WhatsApp (any UA) sees tournament data. */
export function injectInviteOgIntoIndexHtml(html: string, doc: Document | null, token: string, lang: OgLang): string {
  const { title, description, canonicalUrl } = getInviteOgContent(doc, token, lang);
  const e = escapeHtml;

  let out = html;

  const rep = (re: RegExp, replacement: string) => {
    out = out.replace(re, replacement);
  };

  rep(/<meta property="og:title" content="[^"]*"\/?>/, `<meta property="og:title" content="${e(title)}"/>`);
  rep(/<meta property="og:description" content="[^"]*"\/?>/, `<meta property="og:description" content="${e(description)}"/>`);
  rep(/<meta property="og:url" content="[^"]*"\/?>/, `<meta property="og:url" content="${e(canonicalUrl)}"/>`);
  rep(/<meta property="og:image:alt" content="[^"]*"\/?>/, `<meta property="og:image:alt" content="${e(title)}"/>`);
  rep(/<meta name="twitter:title" content="[^"]*"\/?>/, `<meta name="twitter:title" content="${e(title)}"/>`);
  rep(/<meta name="twitter:description" content="[^"]*"\/?>/, `<meta name="twitter:description" content="${e(description)}"/>`);

  out = out.replace(/<title[^>]*>[^<]*<\/title>/, `<title>${e(title)}</title>`);

  return out;
}

function buildOgHtml(opts: {
  canonicalUrl: string;
  origin: string;
  title: string;
  description: string;
  htmlLang: OgLang;
  fbAppId?: string;
}): string {
  const { canonicalUrl, origin, title, description, htmlLang, fbAppId } = opts;
  const e = escapeHtml;
  const fb = fbAppId ? `<meta property="fb:app_id" content="${e(fbAppId)}"/>` : '';
  return `<!DOCTYPE html>
<html lang="${htmlLang}">
<head>
<meta charset="utf-8"/>
<meta property="og:type" content="website"/>
<meta property="og:url" content="${e(canonicalUrl)}"/>
<meta property="og:site_name" content="Matchpoint"/>
<meta property="og:title" content="${e(title)}"/>
<meta property="og:description" content="${e(description)}"/>
<meta property="og:image" content="${e(origin)}/og-image.png"/>
${fb}
<meta property="og:image:width" content="1024"/>
<meta property="og:image:height" content="500"/>
<meta property="og:image:type" content="image/png"/>
<meta property="og:image:alt" content="${e(title)}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${e(title)}"/>
<meta name="twitter:description" content="${e(description)}"/>
<meta name="twitter:image" content="${e(origin)}/og-image.png"/>
</head>
<body></body>
</html>`;
}

/** Minimal HTML when index shell cannot be fetched (fallback). */
export function buildInviteOgHtml(doc: Document | null, token: string, lang: OgLang): string {
  const { title, description, canonicalUrl } = getInviteOgContent(doc, token, lang);
  const origin = siteOrigin();
  const fbAppId = process.env.EXPO_PUBLIC_FB_APP_ID;

  return buildOgHtml({
    canonicalUrl,
    origin,
    title,
    description,
    htmlLang: lang,
    fbAppId,
  });
}
