import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { connectCronometerServer } from "@/lib/cronometer";
import { toast } from "sonner";
import type { Lang } from "@/lib/onboardingSchema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lang?: Lang;
  onConnected?: () => void;
}

const copy = {
  nl: {
    title: "Verbind je Cronometer-account",
    desc: "Log in zodat we je dagelijkse voedingsdata automatisch kunnen synchroniseren. Je kunt dit later opnieuw doen vanaf het tabblad Voeding.",
    user: "Gebruikersnaam of e-mail",
    pw: "Wachtwoord",
    code: "Authenticatiecode",
    codeHint: "Vul de 6-cijferige code uit je authenticator-app in.",
    submit: "Verbinden",
    later: "Later",
    success: "Cronometer verbonden!",
  },
  en: {
    title: "Connect your Cronometer account",
    desc: "Sign in so we can automatically sync your daily nutrition data. You can redo this later from the Nutrition tab.",
    user: "Username or email",
    pw: "Password",
    code: "Authentication code",
    codeHint: "Enter the 6-digit code from your authenticator app.",
    submit: "Connect",
    later: "Later",
    success: "Cronometer connected!",
  },
};

export const CronometerConnectDialog = ({ open, onOpenChange, lang = "nl", onConnected }: Props) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const c = copy[lang];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const res = await connectCronometerServer(username.trim(), password, needsTotp ? totpCode : undefined);
    setLoading(false);
    if (!res.success) {
      if (res.needsTotp) setNeedsTotp(true);
      setErr(res.error || "Failed to connect");
      return;
    }
    toast.success(c.success);
    setUsername("");
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
          <DialogTitle>{c.title}</DialogTitle>
          <DialogDescription>{c.desc}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cron-user">{c.user}</Label>
            <Input
              id="cron-user"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cron-pw">{c.pw}</Label>
            <div className="relative">
              <Input
                id="cron-pw"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {needsTotp && (
            <div className="space-y-1.5">
              <Label htmlFor="cron-code">{c.code}</Label>
              <Input
                id="cron-code"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                required
              />
              <p className="text-xs text-muted-foreground">{c.codeHint}</p>
            </div>
          )}
          {err && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
              {err}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
              {c.later}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : c.submit}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
