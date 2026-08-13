import { del } from "@vercel/blob";
import { z } from "zod";
import { endpoint } from "../../_lib/handler.js";
import { HttpError } from "../../_lib/auth.js";
import { isAllowedBlobHost } from "../../_lib/blobUrls.js";

const schema = z.object({
  url: z.string().url(),
});

/** Deletes a Vercel Blob object. Requires a signed-in user and a Blob URL. */
export default endpoint({ method: "POST", schema }, async ({ input }) => {
  if (!isAllowedBlobHost(input.url)) throw new HttpError(400, "invalid_url");
  await del(input.url);
  return { ok: true };
});
