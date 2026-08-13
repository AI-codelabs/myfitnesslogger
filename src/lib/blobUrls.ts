export function isHttpUrl(path: string): boolean {
  return /^https?:\/\//i.test(path);
}

export function isPublicBlobUrl(path: string): boolean {
  try {
    return new URL(path).hostname.endsWith(".public.blob.vercel-storage.com");
  } catch {
    return false;
  }
}

export function isPrivateBlobUrl(path: string): boolean {
  try {
    const host = new URL(path).hostname;
    if (host.endsWith(".public.blob.vercel-storage.com")) return false;
    return (
      host.endsWith(".private.blob.vercel-storage.com") ||
      host.endsWith(".blob.vercel-storage.com")
    );
  } catch {
    return false;
  }
}

export function isBlobUrl(path: string): boolean {
  return isPublicBlobUrl(path) || isPrivateBlobUrl(path);
}

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

export function safeBlobFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180) || "file";
}

/** Pathname must be `{scope}/{userId}/...` with no traversal. */
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

/** Pathname used when the manager copied a legacy object into Blob. */
export function legacyCopiedPathname(bucket: string, path: string): string {
  return `${bucket}/${path.replace(/^\/+/, "")}`;
}
