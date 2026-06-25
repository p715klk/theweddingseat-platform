export function pbFilterString(value) {
  return JSON.stringify(String(value ?? ''));
}
