// Copies static assets into the Next.js standalone output so the forked
// server can serve client-side chunks, images, and public files.
// Standalone output omits `.next/static` and `public/` by default.
import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function copyIfExists(src, dest) {
  if (existsSync(src)) {
    cpSync(src, dest, { recursive: true });
    console.log(`[copy-standalone] ${src} -> ${dest}`);
  }
}

const standalone = path.join(root, '.next', 'standalone');

copyIfExists(path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static'));
copyIfExists(path.join(root, 'public'), path.join(standalone, 'public'));
