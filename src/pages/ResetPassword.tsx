import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { getBetterAuth } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { clearRecovery, markRecoveryActive } from "@/lib/recovery";

const schema = z
  .object({
    password: z.string().min(6, "Password must be at least 6 characters").max(100),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const err = query.get("error");
    if (err) {
      setError("This reset link is invalid or has expired. Request a new one.");
      return;
    }
    const resetToken = query.get("token");
    if (!resetToken) {
      setError("This reset link is invalid or has expired. Request a new one.");
      return;
    }
    markRecoveryActive();
    setToken(resetToken);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const parsed = schema.safeParse({ password, confirm });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    setLoading(true);
    const { error: resetErr } = await getBetterAuth().resetPassword({
      newPassword: password,
      token,
    });
    setLoading(false);
    if (resetErr) {
      toast.error(resetErr.message || "Could not update password");
      return;
    }
    clearRecovery();
    toast.success("Password updated. Please sign in.");
    navigate("/login", { replace: true });
  };

  const ready = !!token && !error;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Set a new password</h1>
          <p className="text-sm text-muted-foreground">
            {error
              ? error
              : ready
                ? "Choose a new password for your account."
                : "Verifying your reset link…"}
          </p>
          {error && (
            <Button variant="outline" className="mt-2" onClick={() => navigate("/forgot-password", { replace: true })}>
              Request a new link
            </Button>
          )}
        </div>

        {ready && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className="h-11"
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full h-11">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
