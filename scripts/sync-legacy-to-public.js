/**
 * 將 legacy/ 同步到 public/legacy/（Vite 只 serve public）
 * firebase_config.js 由 sync-legacy-firebase-config.js 另行生成，唔會覆蓋
 */
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const srcAdmin = join(root, 'legacy', 'admin');
const dstAdmin = join(root, 'public', 'legacy', 'admin');
const srcJs = join(root, 'legacy', 'js');
const dstJs = join(root, 'public', 'legacy', 'js');

function copyDir(src, dst, skipFiles = new Set()) {
  if (!existsSync(src)) {
    console.warn(`Skip missing: ${src}`);
    return;
  }
  mkdirSync(dst, { recursive: true });
  for (const name of readdirSync(src)) {
    if (skipFiles.has(name)) continue;
    const from = join(src, name);
    const to = join(dst, name);
    if (statSync(from).isDirectory()) {
      copyDir(from, to, skipFiles);
    } else {
      cpSync(from, to);
    }
  }
}

copyDir(srcAdmin, dstAdmin);
copyDir(srcJs, dstJs, new Set(['firebase_config.js']));
console.log('Synced legacy/ → public/legacy/ (admin + js, kept firebase_config.js)');
