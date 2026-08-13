import { z } from "zod";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireUser, HttpError } from "../../_lib/auth.js";
import { isOwnedBlobPathname } from "../../_lib/blobUrls.js";

const schema = z.object({
  scope: z.enum([
    "progress-photos",
    "nutrition-documents",
    "nutrition-templates",
    "onboarding-uploads",
    "email-assets",
  ]),
});

/**
 * Issues a client upload token for Vercel Blob. Files are namespaced
 * `{scope}/{userId}/...` so callers cannot write into another user's prefix.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  try {
    const user = await requireUser(req);
    const result = await handleUpload({
      request: req as unknown as Request,
      body: req.body as HandleUploadBody,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const parsed = schema.safeParse(
          clientPayload ? JSON.parse(clientPayload) : {},
        );
        if (!parsed.success) throw new HttpError(400, "invalid_scope");
        if (!isOwnedBlobPathname(pathname, parsed.data.scope, user.id)) {
          throw new HttpError(400, "invalid_pathname");
        }
        return {
          allowedContentTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/heic",
            "image/heif",
            "image/gif",
            "application/pdf",
          ],
          maximumSizeInBytes: 25 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: user.id, scope: parsed.data.scope }),
        };
      },
      onUploadCompleted: async () => {
        /* paths are stored by the calling feature */
      },
    });
    return res.status(200).json(result);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 400;
    const message = err instanceof Error ? err.message : "upload_failed";
    return res.status(status).json({ error: message });
  }
}
