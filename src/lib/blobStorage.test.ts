import { describe, expect, it } from "vitest";
import {
  isAllowedBlobHost,
  isBlobUrl,
  isHttpUrl,
  isOwnedBlobPathname,
  isPrivateBlobUrl,
  isPublicBlobUrl,
  isSafeBlobPathname,
  legacyCopiedPathname,
  safeBlobFilename,
} from "./blobUrls";

describe("blob URL helpers", () => {
  it("classifies public and private Vercel Blob hosts", () => {
    const pub =
      "https://abc123.public.blob.vercel-storage.com/email-assets/u/header.png";
    const priv =
      "https://abc123.private.blob.vercel-storage.com/progress-photos/u/front.jpg";
    expect(isHttpUrl(pub)).toBe(true);
    expect(isPublicBlobUrl(pub)).toBe(true);
    expect(isPrivateBlobUrl(pub)).toBe(false);
    expect(isBlobUrl(pub)).toBe(true);
    expect(isAllowedBlobHost(pub)).toBe(true);

    expect(isPrivateBlobUrl(priv)).toBe(true);
    expect(isPublicBlobUrl(priv)).toBe(false);
    expect(isBlobUrl(priv)).toBe(true);
    expect(isAllowedBlobHost(priv)).toBe(true);
  });

  it("treats legacy relative storage paths as non-blob", () => {
    const path = "client-id/progress/2024-01-01-front.jpg";
    expect(isHttpUrl(path)).toBe(false);
    expect(isBlobUrl(path)).toBe(false);
    expect(isPrivateBlobUrl(path)).toBe(false);
  });

  it("validates owned pathnames and sanitizes filenames", () => {
    const userId = "11111111-1111-1111-1111-111111111111";
    expect(
      isOwnedBlobPathname(
        `progress-photos/${userId}/front.jpg`,
        "progress-photos",
        userId,
      ),
    ).toBe(true);
    expect(
      isOwnedBlobPathname(
        `progress-photos/other/front.jpg`,
        "progress-photos",
        userId,
      ),
    ).toBe(false);
    expect(isOwnedBlobPathname("../etc/passwd", "progress-photos", userId)).toBe(
      false,
    );
    expect(safeBlobFilename("My Plan (v2).pdf")).toBe("My_Plan_v2_.pdf");
    expect(isSafeBlobPathname("onboarding-uploads/a/b.jpg")).toBe(true);
    expect(isSafeBlobPathname("onboarding-uploads/../b.jpg")).toBe(false);
    expect(
      isSafeBlobPathname(
        "nutrition-documents/cc88f3cd-9664-4658-be3c-d7b48a404275/1780148608088_Persoonlijk_voedingsschema_Yannick_2300.pdf",
      ),
    ).toBe(true);
    expect(legacyCopiedPathname("nutrition-documents", "user/file.pdf")).toBe(
      "nutrition-documents/user/file.pdf",
    );
  });
});
