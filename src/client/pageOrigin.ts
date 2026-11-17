/** README tells people to open 127.0.0.1. localhost is a different origin, so the token would not match. */
export function canonicalPageUrl(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.hostname !== 'localhost') return null;
  url.hostname = '127.0.0.1';
  return url.toString();
}
