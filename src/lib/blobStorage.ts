// Client helpers for Vercel Blob.
// New uploads go to Blob. Copied legacy objects live at `{bucket}/{original_path}`.
// Relative DB paths are resolved from Blob first, then the legacy signed-URL fallback.

import { upload } from "@vercel/blob/client";
import { supabase } from "@/integrations/supabase/client";
import {
  isBlobUrl,
  isHttpUrl,
  isPrivateBlobUrl,
  isPublicBlobUrl,
  legacyCopiedPathname,
  safeBlobFilename,
} from "@/lib/blobUrls";

export type StorageScope =
  | "progress-photos"
  | "nutrition-documents"
  | "nutrition-templates"
  | "onboarding-uploads"
  | "email-assets";

export {
  isBlobUrl,
  isHttpUrl,
  isPrivateBlobUrl,
  isPublicBlobUrl,
} from "@/lib/blobUrls";

const objectUrlCache = new Map<string, string>();

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user?.id;
  if (!id) throw new Error("Not signed in");
  return id;
}

async function fetchBlobObjectUrl(
  qs: URLSearchParams,
  cacheKey: string,
): Promise<string | null> {
  const cached = objectUrlCache.get(cacheKey);
  if (cached) return cached;
  const res = await fetch(`/api/storage/file?${qs}`, {
    headers: await authHeader(),
  });
  if (!res.ok) return null;
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  objectUrlCache.set(cacheKey, objectUrl);
  return objectUrl;
}

/** Upload a file to Vercel Blob. Returns the stored URL to persist in Postgres. */
export async function uploadToBlob(
  file: File | Blob,
  scope: StorageScope,
  filename?: string,
): Promise<{ url: string; pathname: string }> {
  const userId = await currentUserId();
  const name =
    filename || (file instanceof File && file.name ? file.name : "file");
  const pathname = `${scope}/${userId}/${safeBlobFilename(name)}`;
  const result = await upload(pathname, file, {
    access: "private",
    handleUploadUrl: "/api/storage/upload-url",
    clientPayload: JSON.stringify({ scope }),
    headers: await authHeader(),
    multipart: file.size > 4 * 1024 * 1024,
  });
  return { url: result.url, pathname: result.pathname };
}

/**
 * Turn a stored path (Blob URL or legacy relative path) into something an
 * <img> or <a href> can use. Copied legacy files are read from Blob at
 * `{bucket}/{original_path}`; Supabase signed URLs are the fallback only.
 */
export async function resolveStorageUrl(
  path: string | null | undefined,
  bucket: string,
  opts?: { downloadName?: string },
): Promise<string | null> {
  if (!path) return null;
  if (isPublicBlobUrl(path) || (isHttpUrl(path) && !isPrivateBlobUrl(path))) {
    return path;
  }
  if (isPrivateBlobUrl(path)) {
    const qs = new URLSearchParams({ url: path });
    if (opts?.downloadName) qs.set("download", opts.downloadName);
    return fetchBlobObjectUrl(qs, `${path}::${opts?.downloadName ?? ""}`);
  }

  const pathname = legacyCopiedPathname(bucket, path);
  const blobQs = new URLSearchParams({ pathname });
  if (opts?.downloadName) blobQs.set("download", opts.downloadName);
  const fromBlob = await fetchBlobObjectUrl(
    blobQs,
    `${pathname}::${opts?.downloadName ?? ""}`,
  );
  if (fromBlob) return fromBlob;

  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrl(
      path,
      60 * 60,
      opts?.downloadName ? { download: opts.downloadName } : undefined,
    );
  return data?.signedUrl ?? null;
}

/** Download the raw bytes of a stored file (template attach, etc.). */
export async function downloadStorageFile(
  path: string,
  bucket: string,
): Promise<Blob> {
  if (isPrivateBlobUrl(path)) {
    const qs = new URLSearchParams({ url: path });
    const res = await fetch(`/api/storage/file?${qs}`, {
      headers: await authHeader(),
    });
    if (!res.ok) throw new Error("Download failed");
    return res.blob();
  }
  if (isHttpUrl(path)) {
    const res = await fetch(path);
    if (!res.ok) throw new Error("Download failed");
    return res.blob();
  }

  const pathname = legacyCopiedPathname(bucket, path);
  const copied = await fetch(`/api/storage/file?${new URLSearchParams({ pathname })}`, {
    headers: await authHeader(),
  });
  if (copied.ok) return copied.blob();

  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(error?.message || "Download failed");
  return data;
}

/**
 * Best-effort delete. Blob URLs and copied `{bucket}/{path}` objects are
 * removed from Blob; relative paths are also removed from the legacy bucket
 * so the signed-URL fallback cannot resurrect a deleted file.
 */
export async function deleteStorageObject(
  path: string | null | undefined,
  bucket: string,
): Promise<void> {
  if (!path) return;
  if (isBlobUrl(path)) {
    await fetch("/api/storage/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ url: path }),
    });
    return;
  }
  if (isHttpUrl(path)) return;

  await fetch("/api/storage/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ pathname: legacyCopiedPathname(bucket, path) }),
  });
  await supabase.storage.from(bucket).remove([path]);
}
