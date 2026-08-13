/** Keep in sync with src/lib/blobUrls.ts — serverless bundle stays self-contained. */

export function isAllowedBlobHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return (
      host.endsWith(".blob.vercel-storage.com") ||
      host === "blob.vercel-storage.com"
    );
  } catch {
    return false;
  }
}

export function isOwnedBlobPathname(
  pathname: string,
  scope: string,
  userId: string,
): boolean {
  if (!pathname || pathname.includes("..") || pathname.includes("\\")) return false;
  const prefix = `${scope}/${userId}/`;
  return pathname.startsWith(prefix) && pathname.length > prefix.length;
}

export function isSafeBlobPathname(pathname: string): boolean {
  if (!pathname || pathname.includes("..") || pathname.includes("\\") || pathname.includes("\0")) {
    return false;
  }
  if (pathname.startsWith("/") || pathname.includes("//")) return false;
  if (pathname.length > 1024) return false;
  return /^[a-z0-9._(),\s+/-]+$/i.test(pathname);
}
