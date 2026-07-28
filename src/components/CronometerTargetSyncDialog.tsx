import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { connectCronometerWeb } from "@/lib/cronometerTargetsWeb";
import type { Lang } from "@/lib/onboardingSchema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  defaultEmail?: string;
  lang: Lang;
  onConnected?: () => void;
}

const t = (lang: Lang, nl: string, en: string) => (lang === "nl" ? nl : en);

export function CronometerTargetSyncDialog({ open, onOpenChange, clientId, defaultEmail, lang, onConnected }: Props) {
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email || !password) {
      toast.error(t(lang, "Vul e-mail en wachtwoord in", "Enter email and password"));
      return;
    }
    setBusy(true);
    const res = await connectCronometerWeb({
      client_id: clientId,
      email,
      password,
      totpCode: totpCode || undefined,
    });
    setBusy(false);
    if (res.error) {
      if (res.needsTotp) {
        setNeedsTotp(true);
        toast.info(t(lang, "Vul de 2FA-code van de client in", "Enter the client's 2FA code"));
        return;
      }
      return toast.error(res.error);
    }
    toast.success(t(lang, "Cronometer doel-sync verbonden", "Cronometer target sync connected"));
    setPassword("");
    setTotpCode("");
    setNeedsTotp(false);
    onOpenChange(false);
    onConnected?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            {t(lang, "Cronometer doel-sync verbinden", "Connect Cronometer target sync")}
          </DialogTitle>
          <DialogDescription>
            {t(lang,
              "Voer eenmalig de Cronometer-inloggegevens van deze client in. Gegevens worden versleuteld opgeslagen en alleen gebruikt om macro-doelen te synchroniseren.",
              "Enter the client's Cronometer login once. Credentials are stored encrypted and used only to sync macro targets.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t(lang, "E-mail", "Email")}</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label>{t(lang, "Wachtwoord", "Password")}</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </div>
          {needsTotp && (
            <div className="space-y-1.5">
              <Label>{t(lang, "2FA-code (6 cijfers)", "2FA code (6 digits)")}</Label>
              <Input
                inputMode="numeric"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t(lang, "Annuleren", "Cancel")}
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {t(lang, "Verbinden", "Connect")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
