/** Very small, dependency-free "Chrome on Windows" style summary — good enough for a
 * security/device log, not a full UA-parser. Unknown patterns get a generic fallback
 * rather than showing raw UA soup to the user. */
export function describeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Unknown device';
  const browser = /edg\//i.test(userAgent)
    ? 'Edge'
    : /chrome\//i.test(userAgent)
      ? 'Chrome'
      : /firefox\//i.test(userAgent)
        ? 'Firefox'
        : /safari\//i.test(userAgent)
          ? 'Safari'
          : 'Browser';
  const os = /windows/i.test(userAgent)
    ? 'Windows'
    : /mac os/i.test(userAgent)
      ? 'macOS'
      : /android/i.test(userAgent)
        ? 'Android'
        : /iphone|ipad/i.test(userAgent)
          ? 'iOS'
          : /linux/i.test(userAgent)
            ? 'Linux'
            : 'an unknown OS';
  return `${browser} on ${os}`;
}
