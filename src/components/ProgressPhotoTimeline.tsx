import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Camera } from "lucide-react";
import { formatHumanDate } from "@/lib/weeklyCheckin";

export type PhotoRow = {
  id: string;
  taken_on: string;
  front_path: string | null;
  side_path: string | null;
  back_path: string | null;
  weight_kg: number | null;
};

interface Props {
  photos: PhotoRow[];
  lang?: "nl" | "en";
}

async function signUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage
    .from("onboarding-uploads")
    .createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export function ProgressPhotoTimeline({ photos, lang = "nl" }: Props) {
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const next: Record<string, string | null> = {};
      for (const p of photos) {
        for (const slot of ["front", "side", "back"] as const) {
          const path = p[`${slot}_path` as const];
          if (path && !urls[path]) next[path] = await signUrl(path);
        }
      }
      if (Object.keys(next).length) setUrls((u) => ({ ...u, ...next }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos]);

  if (photos.length === 0) {
    return (
      <Card className="p-8 flex flex-col items-center justify-center text-center gap-2 text-muted-foreground">
        <Camera className="h-8 w-8" />
        <p className="text-sm">
          {lang === "nl"
            ? "Nog geen progressie foto's. Begin vandaag!"
            : "No progress photos yet. Start today!"}
        </p>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {photos.map((p) => (
          <Card key={p.id} className="p-3 sm:p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{formatHumanDate(p.taken_on, lang)}</p>
              {p.weight_kg != null && (
                <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground font-medium">
                  {p.weight_kg} kg
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(["front", "side", "back"] as const).map((slot) => {
                const path = p[`${slot}_path` as const];
                const u = path ? urls[path] : null;
                const labelMap = { front: "Voor", side: "Zij", back: "Achter" };
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => u && setOpen(u)}
                    className="relative aspect-[3/4] rounded-lg overflow-hidden bg-muted flex items-center justify-center"
                  >
                    {u ? (
                      <img
                        src={u}
                        alt={slot}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        {labelMap[slot]} —
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-3xl p-2">
          {open && <img src={open} alt="" className="w-full h-auto rounded" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
