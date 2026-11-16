export function resolveListenPort(raw: string | undefined): number {
  const text = (raw ?? '').trim();
  if (!text) return 3000;
  const port = Number(text);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return 3000;
  return port;
}
