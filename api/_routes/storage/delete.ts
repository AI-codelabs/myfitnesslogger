import { del } from "@vercel/blob";
import { z } from "zod";
import { endpoint } from "../../_lib/handler.js";
import { HttpError } from "../../_lib/auth.js";
import { isAllowedBlobHost, isSafeBlobPathname } from "../../_lib/blobUrls.js";

const schema = z
  .object({
    url: z.string().url().optional(),
    pathname: z.string().optional(),
  })
  .refine((v) => !!v.url || !!v.pathname, { message: "url_or_pathname_required" });

/** Deletes a Vercel Blob object by URL or copied legacy pathname. */
export default endpoint({ method: "POST", schema }, async ({ input }) => {
  if (input.url) {
    if (!isAllowedBlobHost(input.url)) throw new HttpError(400, "invalid_url");
    try {
      await del(input.url);
    } catch {
      /* already gone */
    }
    return { ok: true };
  }
  const pathname = input.pathname ?? "";
  if (!isSafeBlobPathname(pathname)) throw new HttpError(400, "invalid_pathname");
  try {
    await del(pathname);
  } catch {
    /* already gone */
  }
  return { ok: true };
});
