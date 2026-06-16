import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

writeFileSync(join('dist', '.nojekyll'), '');

/**
 * GitHub Pages project site SPA fallback（rafgraph/spa-github-pages）
 * 深層路徑先經 404.html redirect 到 /?/path，再由 index.html 還原 URL，避免 HTTP 404。
 * @see https://github.com/rafgraph/spa-github-pages
 */
const dist = 'dist';
const base = process.env.BASE_PATH || '/';
const segmentCount =
  base === '/' ? 0 : base.replace(/\/$/, '').split('/').filter(Boolean).length;

const indexPath = join(dist, 'index.html');
let indexHtml = readFileSync(indexPath, 'utf8');

if (segmentCount > 0) {
  const rewriteScript = `<script type="text/javascript">
(function(l){if(l.search[1]==='/'){var decoded=l.search.slice(1).split('&').map(function(s){return s.replace(/~and~/g,'&')}).join('?');window.history.replaceState(null,null,l.pathname.slice(0,-1)+decoded+l.hash)}}(window.location))
</script>`;

  if (!indexHtml.includes('spa-github-pages')) {
    indexHtml = indexHtml.replace('<head>', `<head>\n    ${rewriteScript}`);
    writeFileSync(indexPath, indexHtml);
  }

  const redirect404 = `<!DOCTYPE html>
<html lang="zh-Hant-HK">
  <head>
    <meta charset="UTF-8" />
    <title>Redirecting…</title>
    <script type="text/javascript">
      // spa-github-pages
      var segmentCount = ${segmentCount};
      var l = window.location;
      l.replace(
        l.protocol + '//' + l.hostname + (l.port ? ':' + l.port : '') +
        l.pathname.split('/').slice(0, 1 + segmentCount).join('/') + '/?/' +
        l.pathname.slice(1).split('/').slice(segmentCount).join('/').replace(/&/g, '~and~') +
        (l.search ? '&' + l.search.slice(1).replace(/&/g, '~and~') : '') +
        l.hash
      );
    </script>
  </head>
  <body></body>
</html>
`;

  writeFileSync(join(dist, '404.html'), redirect404);
  console.log(`GitHub Pages SPA redirect: segmentCount=${segmentCount}, wrote dist/404.html`);
} else {
  writeFileSync(join(dist, '404.html'), indexHtml);
  console.log('Copied dist/index.html → dist/404.html for SPA fallback');
}
