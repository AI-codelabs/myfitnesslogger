import { get } from "@vercel/blob";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { HttpError, requireUser } from "../../_lib/auth.js";
import { isAllowedBlobHost, isSafeBlobPathname } from "../../_lib/blobUrls.js";

/**
 * Streams a private Blob (or a copied legacy pathname) to the signed-in user.
 * Public blob URLs should be used directly; this route exists because the
 * store is private and <img>/<a> cannot send an Authorization header.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  try {
    await requireUser(req);
    const urlParam = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
    const pathParam = Array.isArray(req.query.pathname)
      ? req.query.pathname[0]
      : req.query.pathname;
    const download = Array.isArray(req.query.download)
      ? req.query.download[0]
      : req.query.download;

    let urlOrPathname: string;
    if (typeof urlParam === "string" && urlParam) {
      if (!isAllowedBlobHost(urlParam)) throw new HttpError(400, "invalid_url");
      urlOrPathname = urlParam;
    } else if (typeof pathParam === "string" && pathParam) {
      if (!isSafeBlobPathname(pathParam)) throw new HttpError(400, "invalid_pathname");
      urlOrPathname = pathParam;
    } else {
      throw new HttpError(400, "missing_url");
    }

    const access = urlOrPathname.includes(".public.blob.vercel-storage.com")
      ? "public"
      : "private";
    const result = await get(urlOrPathname, { access });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return res.status(404).json({ error: "not_found" });
    }

    res.setHeader("Content-Type", result.blob.contentType || "application/octet-stream");
    res.setHeader("Cache-Control", "private, max-age=300");
    if (download) {
      const name = String(download).replace(/[^\w.\-]+/g, "_") || "download";
      res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    } else if (result.blob.contentDisposition) {
      res.setHeader("Content-Disposition", result.blob.contentDisposition);
    }

    const reader = result.stream.getReader();
    const chunks: Buffer[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(Buffer.from(value));
    }
    return res.status(200).end(Buffer.concat(chunks));
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : "read_failed";
    if (!res.headersSent) return res.status(status).json({ error: message });
  }
}
