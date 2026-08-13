// Client helpers for Vercel Blob during the storage cutover.
// New uploads go to Blob. Existing relative paths keep working via the
// legacy signed-URL fallback until the manager copies those files over.

import { upload } from "@vercel/blob/client";
import { supabase } from "@/integrations/supabase/client";
import {
  isBlobUrl,
  isHttpUrl,
  isPrivateBlobUrl,
  isPublicBlobUrl,
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
  const access = "private";
  const result = await upload(pathname, file, {
    access,
    handleUploadUrl: "/api/storage/upload-url",
    clientPayload: JSON.stringify({ scope }),
    headers: await authHeader(),
    multipart: file.size > 4 * 1024 * 1024,
  });
  return { url: result.url, pathname: result.pathname };
}

async function fetchPrivateBlobObjectUrl(
  url: string,
  downloadName?: string,
): Promise<string | null> {
  const cacheKey = `${url}::${downloadName ?? ""}`;
  const cached = objectUrlCache.get(cacheKey);
  if (cached) return cached;

  const qs = new URLSearchParams({ url });
  if (downloadName) qs.set("download", downloadName);
  const res = await fetch(`/api/storage/file?${qs}`, {
    headers: await authHeader(),
  });
  if (!res.ok) return null;
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  objectUrlCache.set(cacheKey, objectUrl);
  return objectUrl;
}

/**
 * Turn a stored path (Blob URL or legacy relative path) into something an
 * <img> or <a href> can use. Private blobs are fetched with the user JWT and
 * exposed as object URLs.
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
    return fetchPrivateBlobObjectUrl(path, opts?.downloadName);
  }

  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrl(
      path,
      60 * 60,
      opts?.downloadName ? { download: opts.downloadName } : undefined,
    );
  if (data?.signedUrl) return data.signedUrl;

  // Manager may have copied the object to Blob at `{bucket}/{oldPath}`.
  const qs = new URLSearchParams({ pathname: `${bucket}/${path}` });
  if (opts?.downloadName) qs.set("download", opts.downloadName);
  const res = await fetch(`/api/storage/file?${qs}`, {
    headers: await authHeader(),
  });
  if (!res.ok) return null;
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  objectUrlCache.set(`${bucket}/${path}::${opts?.downloadName ?? ""}`, objectUrl);
  return objectUrl;
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
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(error?.message || "Download failed");
  return data;
}

/** Best-effort delete. Blob URLs go to /api/storage/delete; relative paths to the legacy bucket. */
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
  if (!isHttpUrl(path)) {
    await supabase.storage.from(bucket).remove([path]);
  }
}
