import { ScrollViewStyleReset } from 'expo-router/html';

// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
// The contents of this function only run in Node.js environments and
// do not have access to the DOM or browser APIs.

function siteOrigin(): string {
  return (process.env.EXPO_PUBLIC_INVITE_BASE_URL || 'https://matchpoint.miralab.ar').replace(/\/$/, '');
}

export default function Root({ children }: { children: React.ReactNode }) {
  const origin = siteOrigin();
  const fbAppId = process.env.EXPO_PUBLIC_FB_APP_ID;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        {/* Open Graph / WhatsApp share preview */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${origin}/`} />
        <meta property="og:site_name" content="Matchpoint" />
        <meta property="og:title" content="Matchpoint - Beach Volleyball Tournaments" />
        <meta property="og:description" content="Join tournaments, form teams, and compete. By Miralab." />
        <meta property="og:image" content={`${origin}/og-image.png`} />
        {fbAppId ? <meta property="fb:app_id" content={fbAppId} /> : null}
        <meta property="og:image:width" content="1024" />
        <meta property="og:image:height" content="500" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:alt" content="Matchpoint" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Matchpoint - Beach Volleyball Tournaments" />
        <meta name="twitter:description" content="Join tournaments, form teams, and compete. By Miralab." />
        <meta name="twitter:image" content={`${origin}/og-image.png`} />

        {/* 
          Disable body scrolling on web. This makes ScrollView components work closer to how they do on native. 
          However, body scrolling is often nice to have for mobile web. If you want to enable it, remove this line.
        */}
        <ScrollViewStyleReset />

        {/* Using raw CSS styles as an escape-hatch to ensure the background color never flickers in dark-mode. */}
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
        {/* Add any additional <head> elements that you want globally available on web... */}
      </head>
      <body>{children}</body>
    </html>
  );
}

const responsiveBackground = `
body {
  background-color: #fff;
}
@media (prefers-color-scheme: dark) {
  body {
    background-color: #000;
  }
}`;
