const CHUNK_RELOAD_KEY = 'chunk-reload';

export function isChunkLoadError(error) {
  const msg = String(error?.message || error || '');
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('Failed to load module') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes("Unexpected token '<'")
  );
}

/** 部署後舊 chunk hash 失效時，GitHub Pages 會用 index.html 回應 .js 404 */
export function reloadForStaleChunk() {
  const last = sessionStorage.getItem(CHUNK_RELOAD_KEY);
  const now = Date.now();
  if (last && now - Number(last) < 10000) return false;
  sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
  window.location.reload();
  return true;
}

export function setupChunkReloadHandlers(router) {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    reloadForStaleChunk();
  });

  router.onError((error) => {
    if (!isChunkLoadError(error)) return;
    reloadForStaleChunk();
  });
}
