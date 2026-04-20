import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

const schema = z.object({
  displayName: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Invalid email").max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(100),
});

type Tab = "user" | "coach";

const Signup = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token");
  const [tab, setTab] = useState<Tab>(token ? "user" : ((params.get("as") as Tab) || "user"));
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inviteState, setInviteState] = useState<"checking" | "valid" | "invalid" | "none">(
    token ? "checking" : "none",
  );
  const [inviteId, setInviteId] = useState<string | null>(null);

  // Validate invitation token via SECURITY DEFINER RPC (works for unauthenticated invitees)
  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data, error } = await supabase.rpc("get_invitation_by_token", { _token: token });
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row || row.status !== "pending") {
        setInviteState("invalid");
        return;
      }
      setInviteId(row.id);
      setEmail(row.email);
      setInviteState("valid");
    })();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tab === "user" && !token) {
      toast.error("Users must be invited by a coach.");
      return;
    }
    const parsed = schema.safeParse({ displayName, email, password });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { display_name: displayName, role: tab },
      },
    });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    // Mark invite accepted
    if (token && inviteId && data.user) {
      await supabase
        .from("invitations")
        .update({
          status: "accepted",
          accepted_at: new Date().toISOString(),
          accepted_user_id: data.user.id,
        })
        .eq("id", inviteId);
    }

    toast.success("Account created");
    navigate("/");
  };

  // Token-based invite signup
  if (token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">You're invited</h1>
            <p className="text-sm text-muted-foreground">
              Set up your account to get started with your coach.
            </p>
          </div>

          {inviteState === "checking" && (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {inviteState === "invalid" && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-center space-y-2">
              <p className="font-medium text-destructive">Invalid or used invitation</p>
              <p className="text-sm text-muted-foreground">
                This invite link is no longer valid. Ask your coach for a new one.
              </p>
              <Link to="/login" className="text-sm text-primary font-medium hover:underline inline-block mt-2">
                Already have an account? Sign in
              </Link>
            </div>
          )}

          {inviteState === "valid" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">Full name</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  autoFocus
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} readOnly className="h-11 bg-muted/40" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
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
              <Button type="submit" disabled={loading} className="w-full h-11">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
              </Button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // Standard signup (coach self-signup, or info that users need invite)
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Create your account</h1>
          <p className="text-sm text-muted-foreground">Get started in seconds</p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList className="grid w-full grid-cols-2 h-11">
            <TabsTrigger value="user" className="h-9">User</TabsTrigger>
            <TabsTrigger value="coach" className="h-9">Coach</TabsTrigger>
          </TabsList>
        </Tabs>

        {tab === "user" ? (
          <div className="rounded-lg border border-border/60 bg-muted/40 p-6 text-center space-y-3">
            <p className="text-sm text-foreground font-medium">Invitation required</p>
            <p className="text-sm text-muted-foreground">
              Users join via an invitation from their coach. Ask your coach to send you an invite link.
            </p>
            <Link to="/login?as=user" className="text-sm text-primary font-medium hover:underline inline-block">
              Already have an account? Sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Full name</Label>
              <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required className="h-11" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-11" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
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
            <Button type="submit" disabled={loading} className="w-full h-11">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create coach account"}
            </Button>
          </form>
        )}

        <div className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to={`/login?as=${tab}`} className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Signup;
