import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Dumbbell, Loader2 } from "lucide-react";
import { MigratedPasswordDialog } from "@/components/MigratedPasswordDialog";

type SetupState = {
  email: string;
  name?: string | null;
};

const SETUP_ERRORS: Record<string, string> = {
  passwords_do_not_match: "Passwords do not match",
  invalid_input: "Use at least 6 characters",
  already_has_password: "This account already has a password. Try signing in.",
  account_not_found: "Account not found",
};

function isMissingSessionError(err: unknown) {
  return err instanceof Error && /retrieve user session/i.test(err.message);
}

async function waitForSession(attempts = 8) {
  for (let i = 0; i < attempts; i++) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

async function signInWithRetry(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error) return;
  if (!isMissingSessionError(error)) throw error;
  if (await waitForSession()) return;
  throw error;
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);
  const navigate = useNavigate();
  const { notifySignIn } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      try {
        await signInWithRetry(email, password);
        notifySignIn();
        navigate("/");
        return;
      } catch (signInErr) {
        const check = await fetch("/api/auth/migrated-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const payload = await check.json().catch(() => ({}));
        if (check.ok && payload.needsPasswordSetup) {
          setSetup({
            email: String(payload.email || email).trim().toLowerCase(),
            name: payload.name ?? null,
          });
          return;
        }
        throw signInErr;
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSetupPassword = async (nextPassword: string, confirmPassword: string) => {
    if (!setup) return;
    setSavingPassword(true);
    try {
      const res = await fetch("/api/auth/migrated-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: setup.email,
          password: nextPassword,
          confirmPassword,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = typeof payload.error === "string" ? payload.error : "";
        throw new Error(SETUP_ERRORS[code] || "Could not save password");
      }
      setPassword(nextPassword);
      setEmail(setup.email);
      try {
        await signInWithRetry(setup.email, nextPassword);
        setSetup(null);
        notifySignIn();
        navigate("/");
        return;
      } catch (signInErr) {
        if (isMissingSessionError(signInErr)) {
          setSetup(null);
          toast.success("Password saved. Tap Sign In.");
          return;
        }
        throw signInErr;
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not save password");
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-5 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-2">
            <Dumbbell className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">MyFitnessLogger</h1>
          <p className="text-muted-foreground">Sign in to your account</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              enterKeyHint="next"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-14 text-base md:text-base"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              enterKeyHint="go"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-14 text-base md:text-base"
            />
          </div>
          <Button type="submit" className="w-full h-14 text-base" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sign In
          </Button>
        </form>
      </div>

      <MigratedPasswordDialog
        open={!!setup}
        email={setup?.email ?? ""}
        name={setup?.name}
        submitting={savingPassword}
        onOpenChange={(open) => {
          if (!open) setSetup(null);
        }}
        onSubmit={handleSetupPassword}
      />
    </div>
  );
}
