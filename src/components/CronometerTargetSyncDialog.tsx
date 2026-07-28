import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { connectCronometerWeb } from "@/lib/cronometerTargetsWeb";
import type { Lang } from "@/lib/onboardingSchema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional — omit when the current user IS the client (self-connect). */
  clientId?: string;
  defaultEmail?: string;
  lang: Lang;
  onConnected?: () => void;
}

const t = (lang: Lang, nl: string, en: string) => (lang === "nl" ? nl : en);

export function CronometerTargetSyncDialog({
  open, onOpenChange, clientId, defaultEmail, lang, onConnected,
}: Props) {
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
      client_id: clientId, // undefined = self-connect
      email,
      password,
      totpCode: totpCode || undefined,
    });
    setBusy(false);
    if (res.error) {
      if (res.needsTotp) {
        setNeedsTotp(true);
        toast.info(t(lang, "Vul je 2FA-code in", "Enter your 2FA code"));
        return;
      }
      return toast.error(res.error);
    }
    toast.success(t(lang, "Cronometer verbonden", "Cronometer connected"));
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
            {t(lang, "Verbind je Cronometer-account", "Connect your Cronometer account")}
          </DialogTitle>
          <DialogDescription>
            {t(lang,
              "Log eenmalig in met je Cronometer-gegevens zodat je macro-doelen automatisch worden bijgewerkt in je Cronometer-app.",
              "Sign in once with your Cronometer credentials so your macro targets are automatically kept in sync with your Cronometer app.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground flex items-start gap-2">
          <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <span>
            {t(lang,
              "Je wachtwoord wordt versleuteld opgeslagen en uitsluitend gebruikt om je macro-doelen naar Cronometer te sturen. Je coach ziet je wachtwoord niet.",
              "Your password is stored encrypted and used only to push macro targets to Cronometer. Your coach never sees your password.",
            )}
          </span>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t(lang, "Cronometer-e-mail", "Cronometer email")}</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </div>
          <div className="space-y-1.5">
            <Label>{t(lang, "Wachtwoord", "Password")}</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
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
