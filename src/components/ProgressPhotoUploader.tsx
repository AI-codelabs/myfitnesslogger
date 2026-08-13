import { useRef, useState } from "react";
import { parseDecimal } from "@/lib/parseDecimal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { uploadToBlob } from "@/lib/blobStorage";

type Slot = "front" | "side" | "back";

interface Props {
  clientId: string;
  onUploaded: () => void;
}

export function ProgressPhotoUploader({ clientId, onUploaded }: Props) {
  const [files, setFiles] = useState<Record<Slot, File | null>>({
    front: null,
    side: null,
    back: null,
  });
  const [weight, setWeight] = useState("");
  const [saving, setSaving] = useState(false);
  const inputs = {
    front: useRef<HTMLInputElement>(null),
    side: useRef<HTMLInputElement>(null),
    back: useRef<HTMLInputElement>(null),
  };

  const pick = (s: Slot, f: File | null) => setFiles((p) => ({ ...p, [s]: f }));

  const previewUrl = (f: File | null) => (f ? URL.createObjectURL(f) : null);

  const upload = async () => {
    if (!files.front && !files.side && !files.back) {
      toast.error("Selecteer minstens één foto");
      return;
    }
    setSaving(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const paths: Partial<Record<Slot, string>> = {};
      for (const slot of ["front", "side", "back"] as Slot[]) {
        const f = files[slot];
        if (!f) continue;
        const ext = f.name.split(".").pop() || "jpg";
        const uploaded = await uploadToBlob(f, "progress-photos", `${today}-${slot}.${ext}`);
        paths[slot] = uploaded.url;
      }
      const { error: insErr } = await db.from("progress_photos").insert({
        client_id: clientId,
        taken_on: today,
        front_path: paths.front ?? null,
        side_path: paths.side ?? null,
        back_path: paths.back ?? null,
        weight_kg: parseDecimal(weight),
      });
      if (insErr) throw insErr;
      toast.success("Foto's opgeslagen!");
      setFiles({ front: null, side: null, back: null });
      setWeight("");
      onUploaded();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const SlotBox = ({ slot, label }: { slot: Slot; label: string }) => {
    const f = files[slot];
    const url = previewUrl(f);
    return (
      <button
        type="button"
        onClick={() => inputs[slot].current?.click()}
        className="relative aspect-[3/4] rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/40 transition overflow-hidden flex flex-col items-center justify-center gap-1 text-muted-foreground"
      >
        {url ? (
          <img src={url} alt={label} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <>
            <Camera className="h-6 w-6" />
            <span className="text-xs font-medium">{label}</span>
          </>
        )}
        <input
          ref={inputs[slot]}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => pick(slot, e.target.files?.[0] ?? null)}
        />
      </button>
    );
  };

  return (
    <Card className="p-4 sm:p-5 space-y-4">
      <div>
        <h3 className="font-semibold">Voeg progressie foto's toe</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Maak vandaag je foto's. Vergelijk ze later met je vorige weken.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <SlotBox slot="front" label="Voor" />
        <SlotBox slot="side" label="Zij" />
        <SlotBox slot="back" label="Achter" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
        <div className="space-y-1.5">
          <Label htmlFor="weight">Gewicht vandaag (kg, optioneel)</Label>
          <Input
            id="weight"
            type="text"
            inputMode="text"
            autoComplete="off"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="bv. 78,4 of 78.4"
          />
        </div>
        <Button onClick={upload} disabled={saving} className="h-11">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Upload className="h-4 w-4 mr-2" />
          )}
          Opslaan
        </Button>
      </div>
    </Card>
  );
}
