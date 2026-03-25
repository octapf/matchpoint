/**
 * Fails the build if web export did not embed Open Graph tags from app/+html.tsx.
 * Single-page export omits them; production then has no og:image for WhatsApp/Facebook.
 */
const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
if (!fs.existsSync(indexPath)) {
  console.error('verify-web-og: dist/index.html missing. Run: npx expo export -p web');
  process.exit(1);
}
const html = fs.readFileSync(indexPath, 'utf8');
const hasOgImage =
  html.includes('property="og:image"') &&
  (html.includes('og-image.png') || html.includes('og:image'));
if (!hasOgImage) {
  console.error(
    'verify-web-og: dist/index.html has no og:image meta. Use web.output: "static" in app.config.js and export again.'
  );
  process.exit(1);
}
console.log('verify-web-og: OK (og:image present in dist/index.html)');
