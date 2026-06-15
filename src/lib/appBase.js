/** GitHub Pages 子路徑（例如 /theweddingseat-platform/）或本地 / */
export function appPath(path = '') {
  const base = import.meta.env.BASE_URL || '/';
  const normalized = path.startsWith('/') ? path.slice(1) : path;
  return `${base}${normalized}`;
}

export function appUrl(path = '') {
  if (typeof window === 'undefined') return appPath(path);
  return new URL(appPath(path), window.location.origin).href;
}
