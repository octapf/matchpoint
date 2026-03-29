/**
 * Metro's FallbackWatcher walks node_modules and calls fs.watch on each directory.
 * npm may leave optional platform-specific esbuild packages uninstalled (e.g. darwin on Windows),
 * but something in the tree can still reference those paths, causing ENOENT when watching.
 * Create empty dirs for any missing optional esbuild-* packages so watch() succeeds.
 */
const fs = require('fs');
const path = require('path');

const nm = path.join(__dirname, '..', 'node_modules');
const esbuildPkg = path.join(nm, 'esbuild', 'package.json');
if (!fs.existsSync(esbuildPkg)) {
  process.exit(0);
}

let optionalDependencies = {};
try {
  optionalDependencies = JSON.parse(fs.readFileSync(esbuildPkg, 'utf8')).optionalDependencies ?? {};
} catch {
  process.exit(0);
}

for (const name of Object.keys(optionalDependencies)) {
  if (!name.startsWith('esbuild-')) continue;
  const dir = path.join(nm, name);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      /* ignore */
    }
  }
}
