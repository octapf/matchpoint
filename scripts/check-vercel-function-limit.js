const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const API_DIR = path.join(ROOT, 'api');
const LIMIT = 12;

function walkTsFiles(dir) {
  const out = [];
  const entries = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : [];
  for (const ent of entries) {
    if (ent.name.startsWith('.')) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...walkTsFiles(full));
    } else if (ent.isFile() && ent.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

const files = walkTsFiles(API_DIR)
  .map((f) => path.relative(ROOT, f).replaceAll('\\', '/'))
  .sort();

if (files.length > LIMIT) {
  // eslint-disable-next-line no-console
  console.error(
    [
      `Vercel Hobby limit exceeded: ${files.length} serverless functions (limit ${LIMIT}).`,
      'Each file under `api/**` counts as one function.',
      '',
      'Functions:',
      ...files.map((f) => `- ${f}`),
      '',
      'Fix: consolidate routes (use POST actions) or upgrade plan.',
    ].join('\n')
  );
  process.exit(1);
}

// eslint-disable-next-line no-console
console.log(`OK: ${files.length}/${LIMIT} serverless functions.`);

