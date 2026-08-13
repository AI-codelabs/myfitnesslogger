import { get } from "@vercel/blob";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { HttpError } from "../../_lib/auth.js";
import { isAllowedBlobHost } from "../../_lib/blobUrls.js";

function blobPathname(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname).replace(/^\//, "");
  } catch {
    return "";
  }
}

/**
 * Public read of email header images only. Recipients of check-in emails are
 * not signed in, and the Blob store is private, so this scoped proxy is the
 * public URL stored in `email_templates.header_image_url`.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  try {
    const urlParam = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
    if (typeof urlParam !== "string" || !urlParam) throw new HttpError(400, "missing_url");
    if (!isAllowedBlobHost(urlParam)) throw new HttpError(400, "invalid_url");
    const pathname = blobPathname(urlParam);
    if (!pathname.startsWith("email-assets/")) throw new HttpError(403, "forbidden");

    const result = await get(urlParam, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return res.status(404).json({ error: "not_found" });
    }

    res.setHeader("Content-Type", result.blob.contentType || "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
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
